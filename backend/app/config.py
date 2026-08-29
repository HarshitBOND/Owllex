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
    PORT: int = int(os.getenv("PORT", os.getenv("LEXVERT_PORT", "8000")))
    DEBUG: bool = os.getenv("LEXVERT_DEBUG", "false").lower() == "true"
    ENABLE_SCRAPER_SCHEDULER: bool = os.getenv("ENABLE_SCRAPER_SCHEDULER", "false").lower() == "true"

    # PDF upload
    UPLOAD_DIR: str = os.getenv("LEXVERT_UPLOAD_DIR", str(Path(__file__).resolve().parent.parent / "uploads"))
    MAX_PDF_SIZE_MB: int = int(os.getenv("LEXVERT_MAX_PDF_SIZE_MB", "50"))

    # MongoDB (optional)
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DB: str = os.getenv("MONGODB_DB", "cause_list_db")

    # CORS
    CORS_ORIGINS: list = None
    TRUSTED_HOSTS: list = None

    # OpenAI: embeddings + metadata extraction for the RAG pipeline.
    # Not validated at boot: the API runs fine without RAG configured.
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Internal auth
    INTERNAL_TOKEN: str = os.getenv("LEXVERT_INTERNAL_TOKEN", "")

    # Clerk JWT auth for user-facing APIs
    CLERK_JWT_ISSUER: str = os.getenv("CLERK_JWT_ISSUER", "")
    CLERK_JWT_AUDIENCE: str = os.getenv("CLERK_JWT_AUDIENCE", "")

    # Security
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("LEXVERT_RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("LEXVERT_RATE_LIMIT_MAX_REQUESTS", "120"))

    # Bulk import safety
    MAX_CONCURRENT_BULK_IMPORTS: int = int(os.getenv("LEXVERT_MAX_CONCURRENT_BULK_IMPORTS", "1"))
    IMPORT_PROGRESS_TTL_SECONDS: int = int(os.getenv("LEXVERT_IMPORT_PROGRESS_TTL_SECONDS", "86400"))

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

        if "*" in parsed_origins:
            raise RuntimeError("Wildcard CORS origin is not allowed")

        if not self.DEBUG:
            for origin in parsed_origins:
                if origin.startswith("http://"):
                    raise RuntimeError("HTTP CORS origins are not allowed in production. Use HTTPS origins.")

        if self.RATE_LIMIT_WINDOW_SECONDS <= 0:
            raise RuntimeError("LEXVERT_RATE_LIMIT_WINDOW_SECONDS must be > 0")
        if self.RATE_LIMIT_MAX_REQUESTS <= 0:
            raise RuntimeError("LEXVERT_RATE_LIMIT_MAX_REQUESTS must be > 0")
        if self.MAX_CONCURRENT_BULK_IMPORTS <= 0:
            raise RuntimeError("LEXVERT_MAX_CONCURRENT_BULK_IMPORTS must be > 0")
        if self.IMPORT_PROGRESS_TTL_SECONDS < 300:
            raise RuntimeError("LEXVERT_IMPORT_PROGRESS_TTL_SECONDS must be >= 300")

        trusted_hosts_raw = os.getenv("LEXVERT_TRUSTED_HOSTS", "").strip()
        if trusted_hosts_raw:
            parsed_trusted_hosts = [h.strip() for h in trusted_hosts_raw.split(",") if h.strip()]
        elif self.DEBUG:
            parsed_trusted_hosts = ["localhost", "127.0.0.1"]
        else:
            raise RuntimeError("LEXVERT_TRUSTED_HOSTS must be explicitly configured in production")

        object.__setattr__(self, "TRUSTED_HOSTS", parsed_trusted_hosts)

        object.__setattr__(self, "CORS_ORIGINS", parsed_origins)
        Path(self.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


settings = Settings()
