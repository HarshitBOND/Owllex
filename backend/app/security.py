"""Clerk JWT verification for user-facing routes.

PRODUCTION_TODO.md T4a fixed a full authentication bypass here: with
CLERK_JWT_ISSUER unset (which is how .env.example used to ship it, and which
its own header used to say was optional in production), the old code built
the JWKS URL from the *token's own, unverified* `iss` claim and then verified
the signature against whatever key that URL served -- so anyone could mint a
token, host a JWKS document on their own HTTPS domain, and be authenticated
as any `sub` they chose. `app/config.py::Settings.__post_init__` now refuses
to boot without CLERK_JWT_ISSUER outside DEBUG, and the JWKS URL below is
built once, at import time, from that configured issuer -- never from a
request.
"""

import hmac

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from .config import settings

# Generous enough for a real network round trip to Clerk, tight enough that a
# slow or dead JWKS endpoint fails a request instead of holding a worker
# thread open indefinitely. PyJWT's own default is 30s.
_JWKS_TIMEOUT_SECONDS = 5.0

# Built once, from the *configured* issuer, not per request and not from
# anything in the token: this is what makes the JWKS URL immune to whatever a
# caller's `iss` claim says. `cache_keys=True` means a steady-state deployment
# makes one outbound request per key rotation, not one per authenticated
# request. None only in DEBUG with no issuer configured -- outside DEBUG,
# Settings already refused to start the process without one.
_jwk_client: "PyJWKClient | None" = None
if settings.CLERK_JWT_ISSUER.strip():
    _jwks_url = f"{settings.CLERK_JWT_ISSUER.strip().rstrip('/')}/.well-known/jwks.json"
    _jwk_client = PyJWKClient(_jwks_url, cache_keys=True, timeout=_JWKS_TIMEOUT_SECONDS)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    return parts[1].strip()


async def require_authenticated_user(authorization: str | None = Header(default=None)) -> str:
    token = _extract_bearer_token(authorization)

    if _jwk_client is None:
        # Only reachable in DEBUG with CLERK_JWT_ISSUER unset -- Settings
        # refuses to construct without one outside DEBUG (app/config.py), so
        # this is not a production code path.
        raise HTTPException(status_code=401, detail="Authentication is not configured")

    expected_issuer = settings.CLERK_JWT_ISSUER.strip()

    try:
        # Cheap fail-fast against the *unverified* claim, purely so a token
        # from any other issuer is rejected before making an outbound request
        # to fetch signing keys. This is not the security boundary -- that is
        # the `issuer=` kwarg on the verified decode() below, checked only
        # after the signature is confirmed against the configured issuer's own
        # JWKS. A bug in this pre-check would at worst cost one extra network
        # call, never an authentication bypass.
        unverified_issuer = jwt.decode(token, options={"verify_signature": False}).get("iss")
        if not isinstance(unverified_issuer, str) or unverified_issuer.rstrip("/") != expected_issuer.rstrip(
            "/"
        ):
            raise HTTPException(status_code=401, detail="Token issuer mismatch")

        signing_key = _jwk_client.get_signing_key_from_jwt(token).key

        decode_kwargs = {
            "algorithms": ["RS256"],
            "issuer": expected_issuer,
            "options": {"verify_aud": bool(settings.CLERK_JWT_AUDIENCE.strip())},
        }
        if settings.CLERK_JWT_AUDIENCE.strip():
            decode_kwargs["audience"] = settings.CLERK_JWT_AUDIENCE.strip()

        payload = jwt.decode(token, signing_key, **decode_kwargs)
        clerk_uid = payload.get("sub")
        if not isinstance(clerk_uid, str) or not clerk_uid.strip():
            raise HTTPException(status_code=401, detail="Invalid token subject")

        return clerk_uid.strip()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def require_internal_token(x_internal_token: str | None = Header(default=None)):
    expected = settings.INTERNAL_TOKEN.strip()

    if not expected:
        raise HTTPException(status_code=500, detail="Backend internal auth is not configured")

    received = (x_internal_token or "").strip()
    if not received or not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
