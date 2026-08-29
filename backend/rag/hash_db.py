"""LMDB-backed content-hash index.

O(1) exists/put/get/delete against an on-disk B-tree, so memory usage stays
flat no matter how many hashes are indexed — nothing is loaded into RAM at
import time. The environment is opened once, here, at module import, and
reused by every caller.
"""

import os
import time
from pathlib import Path

import lmdb
from dotenv import load_dotenv

load_dotenv()

_DB_PATH = Path(__file__).resolve().parent / "data" / "hash_index.lmdb"
_DB_PATH.mkdir(parents=True, exist_ok=True)
_MAP_SIZE_BYTES = int(os.getenv("HASH_DB_MAP_SIZE_MB", "4096")) * 1024 * 1024

_env = lmdb.open(str(_DB_PATH), map_size=_MAP_SIZE_BYTES, max_dbs=0)


def exists(hash: str) -> bool:
    with _env.begin() as txn:
        return txn.get(hash.encode()) is not None


def get(hash: str) -> str | None:
    with _env.begin() as txn:
        value = txn.get(hash.encode())
        return value.decode() if value is not None else None


def put(hash: str, value: str = "1") -> None:
    with _env.begin(write=True) as txn:
        txn.put(hash.encode(), value.encode())


def delete(hash: str) -> None:
    with _env.begin(write=True) as txn:
        txn.delete(hash.encode())


def count() -> int:
    with _env.begin() as txn:
        return txn.stat()["entries"]


# Backing up after every single put() would mean a full compacting copy of the
# whole index per document -- fine at hundreds of entries, not at tens of
# millions. Throttle to at most one backup per interval; ingestion keeps
# calling backup_to_r2() after each put() and most calls just no-op.
_MIN_BACKUP_INTERVAL_SECONDS = int(os.getenv("HASH_DB_BACKUP_INTERVAL_SECONDS", "300"))
_last_backup = 0.0


def backup_to_r2(force: bool = False) -> None:
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_BUCKET")
    if not all([account_id, access_key, secret_key, bucket]):
        return  # R2 not configured yet -- keys are coming later

    global _last_backup
    if not force and time.time() - _last_backup < _MIN_BACKUP_INTERVAL_SECONDS:
        return

    import shutil
    import tempfile

    import boto3

    snapshot_dir = tempfile.mkdtemp(prefix="hash_index_backup_")
    try:
        _env.copy(snapshot_dir, compact=True)
        snapshot_file = Path(snapshot_dir) / "data.mdb"

        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
        backup_key = os.getenv("R2_HASH_BACKUP_KEY", "hash_index_backup/hash_index.mdb")
        client.upload_file(str(snapshot_file), bucket, backup_key)
        _last_backup = time.time()
    finally:
        shutil.rmtree(snapshot_dir, ignore_errors=True)
