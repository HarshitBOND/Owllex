"""Raw source document storage in Cloudflare R2.

Keyed raw/<source>/<content_hash>.<ext> per ARCHITECTURE.md's locked storage
design, so an answer can link back to the actual PDF a chunk came from. No-ops
(returns no url) until R2 keys and a public domain are configured -- same
behavior as hash_db.py's backup_to_r2().

The hash in the key is of the document as it was *uploaded*, not of the bytes
this function writes: PDFs are recompressed on the way in (see compress.py), so
the stored object is a derived artifact. The hash stays the document's identity
because it is also the LMDB dedup key and is baked into existing citation links.
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


def upload_private_object(path: str, key: str, content_type: str = "application/octet-stream") -> dict:
    """Write a file to the private bucket at a caller-supplied key.

    Used by /documents/extract so PDFs uploaded through the Next app get the
    same Ghostscript pass as ingested ones. Next owns the key (it derives it
    from the authenticated Clerk uid), so access control stays where it already
    lives -- this function only performs the write.

    Reads R2_PRIVATE_BUCKET first so it targets the same bucket the Next
    storage helper does, falling back to R2_BUCKET for single-bucket setups.
    """
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_PRIVATE_BUCKET") or os.getenv("R2_BUCKET")
    if not all([account_id, access_key, secret_key, bucket]):
        return {"key": None}

    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )
    client.upload_file(path, bucket, key, ExtraArgs={"ContentType": content_type})
    return {"key": key}
