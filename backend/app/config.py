"""
LexVert Configuration — all settings from environment variables.
"""

import os
from pathlib import Path
from dataclasses import dataclass


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

    def __post_init__(self):
        origins = os.getenv("LEXVERT_CORS_ORIGINS", "*")
        object.__setattr__(self, "CORS_ORIGINS", [o.strip() for o in origins.split(",")])
        Path(self.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


settings = Settings()
