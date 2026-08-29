"""Raw source document storage in Cloudflare R2.

Content-addressed at raw/<source>/<content_hash>.<ext> per ARCHITECTURE.md's
locked storage design, so an answer can link back to the actual PDF a chunk
came from. No-ops (returns no url) until R2 keys and a public domain are
configured -- same behavior as hash_db.py's backup_to_r2().
"""

import os

from dotenv import load_dotenv

load_dotenv()


def upload_source_document(path: str, content_hash: str, source: str, ext: str) -> dict:
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_BUCKET")
    if not all([account_id, access_key, secret_key, bucket]):
        return {"key": None, "url": None}

    import boto3

    key = f"raw/{source}/{content_hash}{ext}"

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )
    client.upload_file(path, bucket, key)

    base_url = os.getenv("R2_PUBLIC_DOCS_BASE_URL")
    url = f"{base_url.rstrip('/')}/{key}" if base_url else None

    return {"key": key, "url": url}
