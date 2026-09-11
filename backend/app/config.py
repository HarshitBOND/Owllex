"""
Ravenslaw Configuration all settings from environment variables.
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
    HOST: str = os.getenv("RAVENSLAW_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", os.getenv("RAVENSLAW_PORT", "8000")))
    DEBUG: bool = os.getenv("RAVENSLAW_DEBUG", "false").lower() == "true"
    ENABLE_SCRAPER_SCHEDULER: bool = os.getenv("ENABLE_SCRAPER_SCHEDULER", "false").lower() == "true"

    # PDF upload staging. Under DATA_ROOT, not next to the code: these are whole
    # user PDFs, and a 50-document bulk import staged on the boot SSD is both the
    # wrong disk (see the storage split in rag/core/config.py) and a way to fill
    # a 40GB root filesystem with files that are deleted seconds later. Resolved
    # from the environment rather than from __file__ so the code tree can move.
    UPLOAD_DIR: str = os.getenv(
        "RAVENSLAW_UPLOAD_DIR",
        str(Path(os.getenv("DATA_ROOT", "/data").strip() or "/data") / "tmp" / "uploads"),
    )
    MAX_PDF_SIZE_MB: int = int(os.getenv("RAVENSLAW_MAX_PDF_SIZE_MB", "50"))

    # Lossy PDF recompression before archival (see rag/app/ingest/compress.py).
    # Tuned for maximum storage savings: /screen preset at 72 dpi. Raise this
    # if 72 proves too coarse for seals and signatures. Disable to store
    # originals byte-for-byte.
    PDF_COMPRESSION_ENABLED: bool = os.getenv("RAVENSLAW_PDF_COMPRESSION", "true").lower() == "true"
    PDF_COMPRESSION_DPI: int = int(os.getenv("RAVENSLAW_PDF_COMPRESSION_DPI", "72"))
    PDF_COMPRESSION_TIMEOUT_SECONDS: int = int(os.getenv("RAVENSLAW_PDF_COMPRESSION_TIMEOUT", "120"))

    # MongoDB (optional)
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DB: str = os.getenv("MONGODB_DB", "cause_list_db")

    # CORS
    CORS_ORIGINS: list = None
    TRUSTED_HOSTS: list = None

    # Build the OCR engine at startup rather than on the first upload (see
    # _warm_document_converter in app/main.py). Turn off where boot time
    # matters more than first-request latency, or on an instance that never
    # extracts documents.
    WARM_DOCUMENT_CONVERTER: bool = os.getenv("RAVENSLAW_WARM_DOCUMENT_CONVERTER", "true").lower() == "true"

    # OpenAI. No longer used for embeddings -- those run locally now (see
    # rag/core/embeddings.py). The only remaining caller is the optional
    # metadata refinement pass, which is off unless METADATA_LLM_ENABLED=true.
    # Leave this empty for a deployment that makes no outbound API calls.
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Internal auth
    INTERNAL_TOKEN: str = os.getenv("RAVENSLAW_INTERNAL_TOKEN", "")

    # Clerk JWT auth for user-facing APIs
    CLERK_JWT_ISSUER: str = os.getenv("CLERK_JWT_ISSUER", "")
    CLERK_JWT_AUDIENCE: str = os.getenv("CLERK_JWT_AUDIENCE", "")

    # Security
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RAVENSLAW_RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("RAVENSLAW_RATE_LIMIT_MAX_REQUESTS", "120"))

    # Bulk import safety
    MAX_CONCURRENT_BULK_IMPORTS: int = int(os.getenv("RAVENSLAW_MAX_CONCURRENT_BULK_IMPORTS", "1"))
    IMPORT_PROGRESS_TTL_SECONDS: int = int(os.getenv("RAVENSLAW_IMPORT_PROGRESS_TTL_SECONDS", "86400"))

    def __post_init__(self):
        origins_raw = os.getenv("RAVENSLAW_CORS_ORIGINS", "").strip()

        if origins_raw:
            parsed_origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
        elif self.DEBUG:
            parsed_origins = [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        else:
            raise RuntimeError("RAVENSLAW_CORS_ORIGINS must be explicitly configured in production")

        if "*" in parsed_origins:
            raise RuntimeError("Wildcard CORS origin is not allowed")

        if not self.DEBUG:
            for origin in parsed_origins:
                if origin.startswith("http://"):
                    raise RuntimeError("HTTP CORS origins are not allowed in production. Use HTTPS origins.")

        # PRODUCTION_TODO.md T4a: an unset issuer used to make app/security.py
        # trust the issuer printed inside the *unverified* token -- a full
        # authentication bypass. Read fresh here, like CORS_ORIGINS above,
        # rather than via self.CLERK_JWT_ISSUER (whose class-level default was
        # already evaluated at import time): that is what lets a test construct
        # a second Settings() after changing the environment and actually
        # exercise this check.
        if not os.getenv("CLERK_JWT_ISSUER", "").strip() and not self.DEBUG:
            raise RuntimeError("CLERK_JWT_ISSUER must be explicitly configured in production")

        if self.RATE_LIMIT_WINDOW_SECONDS <= 0:
            raise RuntimeError("RAVENSLAW_RATE_LIMIT_WINDOW_SECONDS must be > 0")
        if self.RATE_LIMIT_MAX_REQUESTS <= 0:
            raise RuntimeError("RAVENSLAW_RATE_LIMIT_MAX_REQUESTS must be > 0")
        if self.MAX_CONCURRENT_BULK_IMPORTS <= 0:
            raise RuntimeError("RAVENSLAW_MAX_CONCURRENT_BULK_IMPORTS must be > 0")
        if self.IMPORT_PROGRESS_TTL_SECONDS < 300:
            raise RuntimeError("RAVENSLAW_IMPORT_PROGRESS_TTL_SECONDS must be >= 300")
        if not 72 <= self.PDF_COMPRESSION_DPI <= 600:
            raise RuntimeError("RAVENSLAW_PDF_COMPRESSION_DPI must be between 72 and 600")
        if self.PDF_COMPRESSION_TIMEOUT_SECONDS <= 0:
            raise RuntimeError("RAVENSLAW_PDF_COMPRESSION_TIMEOUT must be > 0")

        trusted_hosts_raw = os.getenv("RAVENSLAW_TRUSTED_HOSTS", "").strip()
        if trusted_hosts_raw:
            parsed_trusted_hosts = [h.strip() for h in trusted_hosts_raw.split(",") if h.strip()]
        elif self.DEBUG:
            parsed_trusted_hosts = ["localhost", "127.0.0.1"]
        else:
            raise RuntimeError("RAVENSLAW_TRUSTED_HOSTS must be explicitly configured in production")

        object.__setattr__(self, "TRUSTED_HOSTS", parsed_trusted_hosts)

        object.__setattr__(self, "CORS_ORIGINS", parsed_origins)
        try:
            Path(self.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            # Now that this lives under DATA_ROOT, an unmounted volume would
            # otherwise turn an import-time mkdir into a process that refuses to
            # start -- and the /health/storage check that would explain why is in
            # the process that just failed to boot.
            raise RuntimeError(
                f"Cannot create upload directory {self.UPLOAD_DIR}: {exc}. "
                f"Is DATA_ROOT mounted? Check `findmnt {os.getenv('DATA_ROOT', '/data')}`."
            ) from exc


settings = Settings()
