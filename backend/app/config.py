"""
LexVert Configuration — all settings from environment variables.
"""

import os
from pathlib import Path
from dataclasses import dataclass

from dotenv import load_dotenv

# Load environment variables from backend/.env
load_dotenv()


@dataclass(frozen=True)
class Settings:
    # Server
    HOST: str = os.getenv("LEXVERT_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("LEXVERT_PORT", "8000"))
    DEBUG: bool = os.getenv("LEXVERT_DEBUG", "false").lower() == "true"

    # PDF upload
    UPLOAD_DIR: str = os.getenv("LEXVERT_UPLOAD_DIR", str(Path(__file__).resolve().parent.parent / "uploads"))
    MAX_PDF_SIZE_MB: int = int(os.getenv("LEXVERT_MAX_PDF_SIZE_MB", "50"))

    # MongoDB (optional)
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DB: str = os.getenv("MONGODB_DB", "cause_list_db")

    # CORS
    CORS_ORIGINS: list = None

    # Internal auth
    INTERNAL_TOKEN: str = os.getenv("LEXVERT_INTERNAL_TOKEN", "")

    def __post_init__(self):
        origins_raw = os.getenv("LEXVERT_CORS_ORIGINS", "").strip()

        if origins_raw:
            parsed_origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
        elif self.DEBUG:
            parsed_origins = [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        else:
            raise RuntimeError("LEXVERT_CORS_ORIGINS must be explicitly configured in production")

        if not self.DEBUG and "*" in parsed_origins:
            raise RuntimeError("Wildcard CORS origin is not allowed in production")

        object.__setattr__(self, "CORS_ORIGINS", parsed_origins)
        Path(self.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


settings = Settings()
