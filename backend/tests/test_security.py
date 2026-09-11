"""
Tests for app/security.py's Clerk JWT verification -- PRODUCTION_TODO.md T4a.

Real RS256 signing and verification throughout (via `cryptography`, already a
dependency for pyjwt[crypto]), never a bypassed signature check: the whole
point of this task is that a token's own unverified claims must never be
trusted, so weakening these tests the same way would defeat them. The only
mock is the outbound JWKS *lookup* (`_jwk_client.get_signing_key_from_jwt`),
patched to return a fixed, known-trusted key instead of making a real network
call -- what it returns is what a real Clerk JWKS endpoint would return for
the configured issuer.

Run:
    cd backend
    .venv/bin/python -m pytest tests/test_security.py -q
"""

import asyncio
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app import security
from app.config import settings

# Set by tests/conftest.py before app.config (and so app.security's
# module-level PyJWKClient) is first imported.
TEST_ISSUER = settings.CLERK_JWT_ISSUER


def _generate_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


# Generated once for the module: the "real" Clerk key pair, and a second pair
# standing in for an attacker's own -- used to sign a token that claims the
# right issuer but is not actually signed by it.
_TRUSTED_PRIVATE_KEY, _TRUSTED_PUBLIC_KEY = _generate_keypair()
_ATTACKER_PRIVATE_KEY, _ATTACKER_PUBLIC_KEY = _generate_keypair()


def _sign(claims: dict, private_key: bytes) -> str:
    return jwt.encode(claims, private_key, algorithm="RS256")


def _claims(**overrides) -> dict:
    now = int(time.time())
    base = {"iss": TEST_ISSUER, "sub": "user_123", "iat": now, "exp": now + 300}
    base.update(overrides)
    return base


def _run(coro):
    return asyncio.run(coro)


class TestClerkJwtVerification(unittest.TestCase):
    """Every scenario runs against the real module-level `_jwk_client`, with
    only its network call replaced -- so a mistake in *this* module's own
    plumbing (e.g. patching the wrong object) shows up as every test failing,
    not as a false pass."""

    def setUp(self):
        self.get_signing_key = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = _TRUSTED_PUBLIC_KEY
        self.get_signing_key.return_value = mock_signing_key
        patcher = patch.object(security._jwk_client, "get_signing_key_from_jwt", self.get_signing_key)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _call(self, token: str) -> str:
        return _run(security.require_authenticated_user(authorization=f"Bearer {token}"))

    def test_a_correctly_signed_token_from_the_configured_issuer_is_accepted(self):
        token = _sign(_claims(sub="user_abc"), _TRUSTED_PRIVATE_KEY)
        self.assertEqual(self._call(token), "user_abc")
        self.get_signing_key.assert_called_once()

    def test_a_mismatched_issuer_is_rejected_without_any_jwks_lookup(self):
        token = _sign(_claims(iss="https://attacker.example.com"), _TRUSTED_PRIVATE_KEY)
        with self.assertRaises(HTTPException) as ctx:
            self._call(token)
        self.assertEqual(ctx.exception.status_code, 401)
        # This is the actual regression test: the pre-fix bug built the JWKS
        # URL from this exact claim, making an outbound request to whatever
        # domain an attacker put here. It must never even try.
        self.get_signing_key.assert_not_called()

    def test_a_token_forged_with_the_right_issuer_but_the_wrong_key_is_rejected(self):
        # The actual pre-fix bypass, reproduced: attacker signs with their own
        # key but claims the real issuer, so the fast issuer pre-check passes.
        # It must still fail, because the (mocked, but here standing in for
        # Clerk's real one) JWKS lookup is fixed to the configured issuer and
        # returns the *trusted* key, which this signature does not verify
        # against.
        forged = _sign(_claims(iss=TEST_ISSUER), _ATTACKER_PRIVATE_KEY)
        with self.assertRaises(HTTPException) as ctx:
            self._call(forged)
        self.assertEqual(ctx.exception.status_code, 401)
        # It DID reach the JWKS lookup this time -- the issuer looked right.
        self.get_signing_key.assert_called_once()

    def test_missing_subject_claim_is_rejected(self):
        claims = _claims()
        del claims["sub"]
        token = _sign(claims, _TRUSTED_PRIVATE_KEY)
        with self.assertRaises(HTTPException) as ctx:
            self._call(token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_an_expired_token_is_rejected(self):
        now = int(time.time())
        token = _sign(_claims(iat=now - 1000, exp=now - 500), _TRUSTED_PRIVATE_KEY)
        with self.assertRaises(HTTPException) as ctx:
            self._call(token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_authorization_header_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _run(security.require_authenticated_user(authorization=None))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_malformed_authorization_header_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _run(security.require_authenticated_user(authorization="not-a-bearer-token"))
        self.assertEqual(ctx.exception.status_code, 401)


class TestConfigRequiresAnIssuerInProduction(unittest.TestCase):
    """Settings must refuse to boot without CLERK_JWT_ISSUER outside DEBUG.

    Run as a real subprocess deliberately: app.config's dataclass field
    defaults (DEBUG included) are evaluated once, at class-definition time --
    this test session already froze DEBUG=true importing app.config once (see
    tests/conftest.py), so no amount of monkeypatching os.environ in-process
    can make a second `Settings()` here see DEBUG=false. A fresh interpreter
    is the only thing that re-evaluates them, and it is also the honest
    reproduction of what an operator actually hits at boot.
    """

    BACKEND_ROOT = Path(__file__).resolve().parents[1]

    def _boot(self, env: dict) -> subprocess.CompletedProcess:
        with tempfile.TemporaryDirectory(prefix="owllex_security_test_") as data_root:
            return subprocess.run(
                [sys.executable, "-c", "from app.config import Settings; Settings(); print('booted')"],
                cwd=self.BACKEND_ROOT,
                env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "DATA_ROOT": data_root, **env},
                capture_output=True,
                text=True,
                timeout=30,
            )

    def test_missing_issuer_refuses_to_start_outside_debug(self):
        result = self._boot(
            {
                "RAVENSLAW_DEBUG": "false",
                "RAVENSLAW_CORS_ORIGINS": "https://example.com",
                "RAVENSLAW_TRUSTED_HOSTS": "example.com",
                "RAVENSLAW_INTERNAL_TOKEN": "x",
                # CLERK_JWT_ISSUER deliberately absent.
            }
        )
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("CLERK_JWT_ISSUER", result.stderr)

    def test_an_issuer_present_boots_fine_outside_debug(self):
        result = self._boot(
            {
                "RAVENSLAW_DEBUG": "false",
                "RAVENSLAW_CORS_ORIGINS": "https://example.com",
                "RAVENSLAW_TRUSTED_HOSTS": "example.com",
                "RAVENSLAW_INTERNAL_TOKEN": "x",
                "CLERK_JWT_ISSUER": "https://real-issuer.example.com",
            }
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("booted", result.stdout)

    def test_debug_mode_still_boots_without_an_issuer(self):
        # The escape hatch this task deliberately keeps: a laptop checkout
        # with no Clerk instance configured still runs in DEBUG.
        result = self._boot(
            {
                "RAVENSLAW_DEBUG": "true",
            }
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("booted", result.stdout)


if __name__ == "__main__":
    unittest.main()
