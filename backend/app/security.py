import hmac
import importlib

from fastapi import Header, HTTPException

from .config import settings


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    return parts[1].strip()


async def require_authenticated_user(authorization: str | None = Header(default=None)) -> str:
    token = _extract_bearer_token(authorization)

    try:
        jwt = importlib.import_module("jwt")
        py_jwk_client = getattr(jwt, "PyJWKClient")

        unverified_payload = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_exp": False,
                "verify_nbf": False,
                "verify_iat": False,
                "verify_aud": False,
            },
        )
        issuer = unverified_payload.get("iss")
        if not isinstance(issuer, str) or not issuer.startswith("https://"):
            raise HTTPException(status_code=401, detail="Invalid token issuer")

        expected_issuer = settings.CLERK_JWT_ISSUER.strip()
        if expected_issuer and issuer.rstrip("/") != expected_issuer.rstrip("/"):
            raise HTTPException(status_code=401, detail="Token issuer mismatch")

        jwk_client = py_jwk_client(f"{issuer.rstrip('/')}/.well-known/jwks.json")
        signing_key = jwk_client.get_signing_key_from_jwt(token).key

        decode_kwargs = {
            "algorithms": ["RS256"],
            "issuer": expected_issuer or issuer,
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
