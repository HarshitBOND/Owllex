"""
LexVert MongoDB Operations — optional persistent storage layer.
"""

import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import List, Optional

from .models import CaseEntry

logger = logging.getLogger("lexvert.db")


class MongoDB:
    """Thin wrapper around pymongo for cause list storage."""

    def __init__(self, uri: str, db_name: str = "cause_list_db"):
        self._uri = uri
        self._db_name = db_name
        self._client = None
        self._collection = None

    def connect(self) -> bool:
        """Connect to MongoDB. Returns True on success."""
        try:
            from pymongo import MongoClient, ASCENDING
            self._client = MongoClient(self._uri, serverSelectionTimeoutMS=5000)
            self._client.admin.command("ping")
            db = self._client[self._db_name]
            self._collection = db["cases"]
            self._collection.create_index(
                [("main_case_no", ASCENDING), ("list_date", ASCENDING), ("court_no", ASCENDING)],
                unique=True,
            )
            logger.info("MongoDB connected to %s", self._db_name)
            return True
        except ImportError:
            logger.warning("pymongo not installed — MongoDB disabled")
            return False
        except Exception as e:
            logger.error("MongoDB connection failed: %s", e)
            return False

    def insert_cases(self, cases: List[CaseEntry]) -> dict:
        """Insert cases, skip duplicates. Returns {inserted, duplicates}."""
        if not self._collection:
            return {"inserted": 0, "duplicates": 0, "error": "Not connected"}

        from pymongo.errors import DuplicateKeyError

        inserted = 0
        for c in cases:
            doc = asdict(c)
            doc["imported_at"] = datetime.now(timezone.utc).isoformat()
            try:
                self._collection.insert_one(doc)
                inserted += 1
            except DuplicateKeyError:
                pass

        duplicates = len(cases) - inserted
        logger.info("Inserted %d cases (%d duplicates skipped)", inserted, duplicates)
        return {"inserted": inserted, "duplicates": duplicates}

    def close(self):
        if self._client:
            self._client.close()
            logger.info("MongoDB connection closed")

    @property
    def is_connected(self) -> bool:
        if not self._client:
            return False
        try:
            self._client.admin.command("ping")
            return True
        except Exception:
            return False
