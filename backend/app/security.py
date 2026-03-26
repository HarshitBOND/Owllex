import hmac

from fastapi import Header, HTTPException

from .config import settings


async def require_internal_token(x_internal_token: str | None = Header(default=None)):
    expected = settings.INTERNAL_TOKEN.strip()

    if not expected:
        raise HTTPException(status_code=500, detail="Backend internal auth is not configured")

    received = (x_internal_token or "").strip()
    if not received or not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
