"""
Ravenslaw PDF Scraper — Downloads and parses Delhi HC cause list PDFs.
Runs on a daily schedule or can be triggered manually.
"""

import hashlib
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from dataclasses import asdict

from .config import settings
from .parser import parse_pdf

logger = logging.getLogger("ravenslaw.scraper")

TEMP_DIR = os.path.join(settings.UPLOAD_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

COURT_URL = os.getenv(
    "COURT_WEBSITE_URL",
    "https://delhihighcourt.nic.in/web/cause-lists/cause-list",
)


def _file_hash(filepath: str) -> str:
    """SHA-256 hash of a file on disk."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _get_db():
    """Get pymongo database handle."""
    from pymongo import MongoClient, ASCENDING

    uri = settings.MONGODB_URI
    if not uri:
        raise RuntimeError("MONGODB_URI is required for scraper")

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    db = client[settings.MONGODB_DB]

    # Ensure indexes
    db["downloaded_pdfs"].create_index("file_hash", unique=True)
    db["downloaded_pdfs"].create_index([("downloaded_at", -1)])
    db["scraper_logs"].create_index([("run_date", -1)])
    db["scraped_cases"].create_index(
        [("main_case_no", ASCENDING), ("list_date", ASCENDING), ("court_no", ASCENDING)],
        unique=True,
    )
    return client, db


def _fetch_pdfs_from_single_page(page_url: str) -> List[Dict]:
    """
    Fetch PDFs from a single page of the court website.
    Returns list of dicts: [{filename, url, date_str}]
    """
    pdfs: List[Dict] = []
    try:
        resp = requests.get(page_url, timeout=30, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Find all PDF links on the page
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if href.lower().endswith(".pdf"):
                # Resolve relative URLs
                if href.startswith("/"):
                    href = f"https://delhihighcourt.nic.in{href}"
                elif not href.startswith("http"):
                    href = f"https://delhihighcourt.nic.in/{href}"
                
                filename = href.split("/")[-1]
                
                # Try to extract date from filename or link text
                date_str = _extract_date_from_text(filename) or _extract_date_from_text(link.get_text())
                
                pdfs.append({
                    "filename": filename,
                    "url": href,
                    "date_str": date_str or "",
                })
    except Exception as e:
        logger.error("Failed to fetch PDFs from %s: %s", page_url, e)
    
    return pdfs


def _get_max_page_number() -> int:
    """
    Get the maximum page number from the Delhi High Court pagination.
    The court website uses ?page=N pagination (0-indexed).
    """
    try:
        resp = requests.get(COURT_URL, timeout=30, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Find the "Last" pagination link which shows ?page=N
        last_link = soup.find("a", title="Go to last page")
        if last_link and last_link.get("href"):
            href = last_link["href"]
            # Extract page number from ?page=120
            match = re.search(r"[?&]page=(\d+)", href)
            if match:
                return int(match.group(1))
        
        # Fallback: count pagination items
        pager_items = soup.find_all("li", class_="pager__item")
        max_page = 0
        for item in pager_items:
            link = item.find("a")
            if link and link.get("href"):
                match = re.search(r"[?&]page=(\d+)", link["href"])
                if match:
                    max_page = max(max_page, int(match.group(1)))
        
        return max_page if max_page > 0 else 0
        
    except Exception as e:
        logger.error("Failed to get max page number: %s", e)
        return 0


def fetch_pdfs_from_court(
    max_pages: Optional[int] = None,
    days_back: Optional[int] = None,
    fetch_all: bool = False,
) -> List[Dict]:
    """
    Fetch list of available PDFs from the court website with pagination support.
    
    Args:
        max_pages: Maximum number of pages to fetch (None = auto-determine based on days_back)
        days_back: Filter PDFs from the last N days. If provided, will fetch enough pages
                   to cover the date range. Use days_back=60 for ~2 months.
        fetch_all: If True, fetches ALL pages (can be 100+ pages). Use with caution.
    
    Returns list of dicts: [{filename, url, date_str}]
    
    The Delhi High Court website paginates cause lists with ~10 PDFs per page.
    """
    pdfs: List[Dict] = []
    seen_urls: set = set()  # Deduplicate across pages
    
    try:
        # Determine how many pages to fetch
        total_pages = _get_max_page_number()
        logger.info("Court website has %d total pages of PDFs", total_pages + 1)
        
        if fetch_all:
            pages_to_fetch = total_pages + 1
        elif max_pages is not None:
            pages_to_fetch = min(max_pages, total_pages + 1)
        elif days_back is not None:
            # Estimate pages needed: ~5-15 PDFs per day (main + supplementary lists)
            # ~10 PDFs per page, so roughly 1-2 days per page
            estimated_pages = max(1, (days_back // 2) + 5)  # Extra buffer
            pages_to_fetch = min(estimated_pages, total_pages + 1)
            logger.info("Fetching ~%d pages to cover %d days back", pages_to_fetch, days_back)
        else:
            # Default: just fetch first page (original behavior for daily cron)
            pages_to_fetch = 1
        
        cutoff_date = None
        if days_back is not None and days_back > 0:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
            logger.info("Date cutoff: %s (%d days back)", cutoff_date.strftime("%Y-%m-%d"), days_back)
        
        for page_num in range(pages_to_fetch):
            page_url = f"{COURT_URL}?page={page_num}"
            logger.info("Fetching page %d/%d: %s", page_num + 1, pages_to_fetch, page_url)
            
            page_pdfs = _fetch_pdfs_from_single_page(page_url)
            
            # Filter duplicates and apply date filter
            new_pdfs_count = 0
            for pdf in page_pdfs:
                if pdf["url"] in seen_urls:
                    continue
                seen_urls.add(pdf["url"])
                
                # Apply date filter if specified
                if cutoff_date and pdf.get("date_str"):
                    try:
                        pdf_date = _parse_date_str(pdf["date_str"])
                        if pdf_date and pdf_date < cutoff_date:
                            # PDF is older than cutoff, skip
                            continue
                    except Exception:
                        pass  # Can't parse date, include it anyway
                
                pdfs.append(pdf)
                new_pdfs_count += 1
            
            logger.info("Page %d: found %d PDFs (%d new)", page_num + 1, len(page_pdfs), new_pdfs_count)
            
            # Early exit: if we found mostly duplicates or no new PDFs, we may have enough
            if new_pdfs_count == 0 and page_num > 0:
                logger.info("No new PDFs on page %d, stopping pagination", page_num + 1)
                break
            
            # Be polite to the server
            if page_num < pages_to_fetch - 1:
                time.sleep(0.5)
        
        logger.info("Total: Found %d unique PDFs across %d pages", len(pdfs), pages_to_fetch)
        
    except Exception as e:
        logger.error("Failed to fetch court PDFs: %s", e)
    
    return pdfs


def _parse_date_str(date_str: str) -> Optional[datetime]:
    """Parse various date string formats into datetime."""
    if not date_str:
        return None
    
    # Normalize separators
    normalized = date_str.replace("_", "-").replace(".", "-")
    
    # Try common formats
    formats = [
        "%Y-%m-%d",    # 2024-01-15
        "%d-%m-%Y",    # 15-01-2024
        "%d-%m-%y",    # 15-01-24
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(normalized, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    
    return None


def _extract_date_from_text(text: str) -> Optional[str]:
    """Try to extract a date string from text (filename or link text)."""
    if not text:
        return None
    # Match patterns like 2024-01-15, 2024_01_15, 15-01-2024, 15.01.2024
    patterns = [
        r"(\d{4}[-_]\d{2}[-_]\d{2})",      # YYYY-MM-DD or YYYY_MM_DD
        r"(\d{2}[-_.]\d{2}[-_.]\d{4})",      # DD-MM-YYYY or DD.MM.YYYY
        r"(\d{2}[-_.]\d{2}[-_.]\d{2})",      # DD-MM-YY
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1)
    return None


def download_pdf(url: str, filename: str) -> str:
    """Download a PDF from *url* and save to temp dir. Returns file path."""
    dest = os.path.join(TEMP_DIR, filename)
    logger.info("Downloading %s → %s", url, dest)
    resp = requests.get(url, timeout=60, stream=True)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return dest


def process_single_pdf(pdf_path: str, db, source_url: str = "") -> Dict:
    """
    Parse one PDF, store results in MongoDB, delete the file.
    Returns a summary dict.
    """
    filename = os.path.basename(pdf_path)
    file_size = os.path.getsize(pdf_path)
    fhash = _file_hash(pdf_path)

    # Duplicate check
    existing = db["downloaded_pdfs"].find_one({"file_hash": fhash})
    if existing:
        logger.info("Skipping duplicate PDF %s (hash %s)", filename, fhash[:12])
        _safe_delete(pdf_path)
        return {"filename": filename, "status": "skipped", "reason": "duplicate"}

    # Record in downloaded_pdfs (pending)
    pdf_doc = {
        "filename": filename,
        "download_url": source_url,
        "downloaded_at": datetime.now(timezone.utc),
        "file_size_bytes": file_size,
        "file_hash": fhash,
        "parse_status": "pending",
        "cases_extracted": 0,
        "processed": False,
        "deleted_at": None,
        "error_message": None,
    }
    db["downloaded_pdfs"].insert_one(pdf_doc)

    try:
        start = time.time()
        cases = parse_pdf(pdf_path)
        elapsed = time.time() - start
        logger.info("Parsed %s: %d cases in %.2fs", filename, len(cases), elapsed)

        # Convert to dicts and store
        case_docs = []
        for c in cases:
            doc = asdict(c)
            doc["source_pdf"] = filename
            doc["parsed_at"] = datetime.now(timezone.utc)
            doc["status"] = "extracted"
            case_docs.append(doc)

        inserted = 0
        duplicates = 0
        from pymongo.errors import DuplicateKeyError

        for doc in case_docs:
            try:
                db["scraped_cases"].insert_one(doc)
                inserted += 1
            except DuplicateKeyError:
                duplicates += 1

        # Update downloaded_pdfs record
        db["downloaded_pdfs"].update_one(
            {"file_hash": fhash},
            {
                "$set": {
                    "parse_status": "completed",
                    "cases_extracted": inserted,
                    "processed": True,
                    "execution_time_seconds": round(elapsed, 2),
                }
            },
        )

        return {
            "filename": filename,
            "status": "completed",
            "cases_extracted": inserted,
            "duplicates": duplicates,
            "execution_time": round(elapsed, 2),
        }

    except Exception as e:
        logger.exception("Failed to parse %s", filename)
        db["downloaded_pdfs"].update_one(
            {"file_hash": fhash},
            {"$set": {"parse_status": "failed", "error_message": str(e)}},
        )
        # Don't delete on error — keep for manual review
        return {"filename": filename, "status": "failed", "error": str(e)}


def _safe_delete(filepath: str):
    """Delete file and ignore errors."""
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
    except OSError:
        pass


def run_scraper() -> Dict:
    """
    Full scraper run: fetch → download → parse → store → cleanup → log.
    Called by scheduler or manual trigger.
    """
    run_start = datetime.now(timezone.utc)
    client, db = _get_db()

    log = {
        "run_date": run_start,
        "pdfs_found": 0,
        "pdfs_downloaded": 0,
        "pdfs_skipped": 0,
        "cases_extracted": 0,
        "execution_time_seconds": 0,
        "status": "success",
        "error_message": None,
        "results": [],
    }

    try:
        pdfs = fetch_pdfs_from_court()
        log["pdfs_found"] = len(pdfs)

        for pdf_info in pdfs:
            filename = pdf_info["filename"]
            url = pdf_info["url"]

            # Check if already processed
            existing = db["downloaded_pdfs"].find_one({"filename": filename})
            if existing and existing.get("processed"):
                log["pdfs_skipped"] += 1
                continue

            try:
                pdf_path = download_pdf(url, filename)
                log["pdfs_downloaded"] += 1

                result = process_single_pdf(pdf_path, db, source_url=url)
                log["results"].append(result)

                if result["status"] == "completed":
                    log["cases_extracted"] += result.get("cases_extracted", 0)
                    # Cleanup
                    _safe_delete(pdf_path)
                    db["downloaded_pdfs"].update_one(
                        {"filename": filename},
                        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
                    )
            except Exception as e:
                logger.error("Error processing %s: %s", filename, e)
                log["results"].append({"filename": filename, "status": "failed", "error": str(e)})

        elapsed = (datetime.now(timezone.utc) - run_start).total_seconds()
        log["execution_time_seconds"] = round(elapsed, 2)

    except Exception as e:
        logger.exception("Scraper run failed")
        log["status"] = "failed"
        log["error_message"] = str(e)

    # Save log
    try:
        db["scraper_logs"].insert_one(log)
    except Exception:
        logger.error("Failed to save scraper log")

    try:
        client.close()
    except Exception:
        pass

    return log


# ─── In-memory progress tracking for bulk imports ─────────────────────────

_active_imports: Dict[str, Dict[str, Any]] = {}
_active_imports_lock = threading.Lock()


def _cleanup_old_imports() -> None:
    now_ts = time.time()
    ttl_seconds = settings.IMPORT_PROGRESS_TTL_SECONDS
    stale_ids: List[str] = []

    for iid, data in _active_imports.items():
        started_ts = data.get("started_ts", now_ts)
        if data.get("status") in ("completed", "failed") and (now_ts - started_ts) > ttl_seconds:
            stale_ids.append(iid)

    for iid in stale_ids:
        _active_imports.pop(iid, None)


def get_import_progress(import_id: str) -> Optional[Dict]:
    """Get the current progress for an import session."""
    with _active_imports_lock:
        _cleanup_old_imports()
        return _active_imports.get(import_id)


def get_running_import_count() -> int:
    """Count currently running import sessions."""
    with _active_imports_lock:
        _cleanup_old_imports()
        return sum(1 for data in _active_imports.values() if data.get("status") == "running")


def get_active_imports_snapshot() -> Dict[str, Dict[str, Any]]:
    """Get a safe snapshot of active imports for status endpoints."""
    with _active_imports_lock:
        _cleanup_old_imports()
        return dict(_active_imports)


def _update_progress(
    import_id: str,
    status: str,
    message: str,
    data: Optional[Dict] = None,
    callback: Optional[Callable] = None,
):
    """Update import progress and notify via callback if set."""
    update = {
        "type": "status_update",
        "status": status,
        "message": message,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with _active_imports_lock:
        _cleanup_old_imports()
        if import_id in _active_imports:
            _active_imports[import_id]["current"] = update
            _active_imports[import_id]["log"].append(update)
    if callback:
        try:
            callback(update)
        except Exception:
            pass


def parse_causelist_bulk(
    import_id: str,
    days_back: int = 3,
    auto_delete_pdfs: bool = True,
    start_from_checkpoint: bool = True,
    max_pages: Optional[int] = None,
    fetch_all_pages: bool = False,
) -> Dict:
    """
    Full bulk workflow: fetch PDFs → filter by checkpoint → download → parse → cleanup.
    Stores progress in _active_imports for real-time polling.
    
    Args:
        import_id: Unique identifier for this import session
        days_back: Number of days to look back for PDFs (default 3, max ~365)
                   Use 60 for ~2 months, 90 for ~3 months
        auto_delete_pdfs: Delete PDF files after processing
        start_from_checkpoint: Skip already-processed PDFs
        max_pages: Maximum pagination pages to fetch (overrides days_back calculation)
        fetch_all_pages: Fetch ALL available pages (100+), use with caution
    """
    with _active_imports_lock:
        _cleanup_old_imports()
        _active_imports[import_id] = {
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "started_ts": time.time(),
            "current": None,
            "log": [],
            "summary": None,
        }

    run_start = datetime.now(timezone.utc)
    client, db = _get_db()

    summary = {
        "import_id": import_id,
        "pdfs_found": 0,
        "pdfs_downloaded": 0,
        "pdfs_processed": 0,
        "pdfs_skipped": 0,
        "cases_parsed": 0,
        "errors": 0,
        "status": "completed",
        "results": [],
        "days_back": days_back,
        "max_pages": max_pages,
        "fetch_all_pages": fetch_all_pages,
    }

    try:
        # Phase 1: Fetch PDF URLs with pagination support
        msg = f"Fetching PDF list from Delhi High Court ({days_back} days back"
        if fetch_all_pages:
            msg += ", ALL pages"
        elif max_pages:
            msg += f", max {max_pages} pages"
        msg += ")..."
        _update_progress(import_id, "fetching_pdfs", msg)

        pdfs = fetch_pdfs_from_court(
            max_pages=max_pages,
            days_back=days_back,
            fetch_all=fetch_all_pages,
        )
        summary["pdfs_found"] = len(pdfs)

        if not pdfs:
            _update_progress(import_id, "completed", "No PDFs found on court website.", {
                "pdfs_found": 0,
            })
            summary["status"] = "completed"
            with _active_imports_lock:
                if import_id in _active_imports:
                    _active_imports[import_id]["status"] = "completed"
                    _active_imports[import_id]["summary"] = summary
            _save_import_log(db, summary, run_start)
            client.close()
            return summary

        _update_progress(import_id, "fetching_pdfs", f"Found {len(pdfs)} PDFs on court website.", {
            "pdfs_found": len(pdfs),
        })

        # Phase 1.5: Filter by checkpoint
        if start_from_checkpoint:
            checkpoint = db["pdf_tracking"].find_one({"source": "cause_list"})
            if checkpoint and checkpoint.get("last_processed_timestamp"):
                cutoff = checkpoint["last_processed_timestamp"]
                logger.info("Checkpoint found: filtering PDFs after %s", cutoff)
                # Filter by date if available, otherwise skip checkpoint filtering
                filtered = []
                for pdf in pdfs:
                    existing = db["downloaded_pdfs"].find_one({"download_url": pdf["url"], "processed": True})
                    if not existing:
                        filtered.append(pdf)
                pdfs = filtered
                _update_progress(import_id, "fetching_pdfs",
                    f"After checkpoint filter: {len(pdfs)} new PDFs to process.", {
                        "pdfs_found": summary["pdfs_found"],
                        "pdfs_new": len(pdfs),
                    })

        # Filter by days_back if specified
        if days_back > 0:
            cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
            logger.info("Filtering PDFs from last %d days (cutoff: %s)", days_back, cutoff_date)

        # Phase 2: Download and parse each PDF
        for i, pdf_info in enumerate(pdfs):
            filename = pdf_info["filename"]
            url = pdf_info["url"]

            _update_progress(import_id, "downloading",
                f"Downloading {i+1}/{len(pdfs)}: {filename}...", {
                    "pdfs_found": summary["pdfs_found"],
                    "pdfs_downloaded": summary["pdfs_downloaded"],
                    "pdfs_processed": summary["pdfs_processed"],
                    "cases_parsed": summary["cases_parsed"],
                    "current_file": filename,
                })

            # Check if already downloaded & processed
            existing = db["downloaded_pdfs"].find_one({"download_url": url, "processed": True})
            if existing:
                summary["pdfs_skipped"] += 1
                _update_progress(import_id, "downloading",
                    f"Skipped {filename} (already processed).", {
                        "pdfs_found": summary["pdfs_found"],
                        "pdfs_downloaded": summary["pdfs_downloaded"],
                        "pdfs_processed": summary["pdfs_processed"],
                        "cases_parsed": summary["cases_parsed"],
                        "current_file": filename,
                    })
                continue

            try:
                pdf_path = download_pdf(url, filename)
                summary["pdfs_downloaded"] += 1

                _update_progress(import_id, "parsing",
                    f"Parsing cases from {filename}...", {
                        "pdfs_found": summary["pdfs_found"],
                        "pdfs_downloaded": summary["pdfs_downloaded"],
                        "pdfs_processed": summary["pdfs_processed"],
                        "cases_parsed": summary["cases_parsed"],
                        "current_file": filename,
                    })

                # Parse & store
                result = process_single_pdf(pdf_path, db, source_url=url)
                result["import_id"] = import_id
                summary["results"].append(result)

                # Update downloaded_pdfs with import_id
                db["downloaded_pdfs"].update_one(
                    {"download_url": url},
                    {"$set": {"import_id": import_id, "download_date_str": pdf_info.get("date_str", "")}},
                )

                if result.get("status") == "completed":
                    cases_count = result.get("cases_extracted", 0)
                    summary["pdfs_processed"] += 1
                    summary["cases_parsed"] += cases_count

                    # Cleanup
                    if auto_delete_pdfs:
                        _safe_delete(pdf_path)
                        db["downloaded_pdfs"].update_one(
                            {"download_url": url},
                            {"$set": {"deleted_at": datetime.now(timezone.utc)}},
                        )
                        _update_progress(import_id, "cleaning",
                            f"Extracted {cases_count} cases from {filename}. File deleted.", {
                                "pdfs_found": summary["pdfs_found"],
                                "pdfs_downloaded": summary["pdfs_downloaded"],
                                "pdfs_processed": summary["pdfs_processed"],
                                "cases_parsed": summary["cases_parsed"],
                                "current_file": filename,
                            })
                    else:
                        _update_progress(import_id, "parsing",
                            f"Extracted {cases_count} cases from {filename}.", {
                                "pdfs_found": summary["pdfs_found"],
                                "pdfs_downloaded": summary["pdfs_downloaded"],
                                "pdfs_processed": summary["pdfs_processed"],
                                "cases_parsed": summary["cases_parsed"],
                                "current_file": filename,
                            })
                elif result.get("status") == "skipped":
                    summary["pdfs_skipped"] += 1
                else:
                    summary["errors"] += 1
                    _update_progress(import_id, "error",
                        f"Failed to parse {filename}: {result.get('error', 'Unknown error')}", {
                            "pdfs_found": summary["pdfs_found"],
                            "pdfs_downloaded": summary["pdfs_downloaded"],
                            "pdfs_processed": summary["pdfs_processed"],
                            "cases_parsed": summary["cases_parsed"],
                            "current_file": filename,
                        })

            except Exception as e:
                logger.error("Error processing %s: %s", filename, e)
                summary["errors"] += 1
                summary["results"].append({"filename": filename, "status": "failed", "error": str(e)})
                _update_progress(import_id, "error",
                    f"Error downloading {filename}: {str(e)}", {
                        "pdfs_found": summary["pdfs_found"],
                        "pdfs_downloaded": summary["pdfs_downloaded"],
                        "pdfs_processed": summary["pdfs_processed"],
                        "cases_parsed": summary["cases_parsed"],
                        "current_file": filename,
                    })

        # Phase 5: Update checkpoint
        if pdfs and summary["pdfs_processed"] > 0:
            last_pdf = pdfs[-1]
            db["pdf_tracking"].update_one(
                {"source": "cause_list"},
                {
                    "$set": {
                        "last_processed_pdf_url": last_pdf["url"],
                        "last_processed_timestamp": datetime.now(timezone.utc),
                        "checkpoint_identifier": last_pdf["filename"],
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$setOnInsert": {
                        "source": "cause_list",
                        "created_at": datetime.now(timezone.utc),
                    },
                },
                upsert=True,
            )

        elapsed = (datetime.now(timezone.utc) - run_start).total_seconds()
        summary["execution_time_seconds"] = round(elapsed, 2)

        _update_progress(import_id, "completed",
            f"Import complete! {summary['pdfs_processed']} PDFs processed, "
            f"{summary['cases_parsed']} cases extracted in {round(elapsed, 1)}s.", {
                "pdfs_found": summary["pdfs_found"],
                "pdfs_downloaded": summary["pdfs_downloaded"],
                "pdfs_processed": summary["pdfs_processed"],
                "cases_parsed": summary["cases_parsed"],
                "errors": summary["errors"],
                "execution_time_seconds": summary["execution_time_seconds"],
            })

    except Exception as e:
        logger.exception("Bulk causelist import failed")
        summary["status"] = "failed"
        summary["error_message"] = str(e)
        _update_progress(import_id, "error", f"Import failed: {str(e)}")

    # Save log and finalize
    _save_import_log(db, summary, run_start)
    with _active_imports_lock:
        if import_id in _active_imports:
            _active_imports[import_id]["status"] = summary["status"]
            _active_imports[import_id]["summary"] = summary

    try:
        client.close()
    except Exception:
        pass

    return summary


def _save_import_log(db, summary: Dict, run_start: datetime):
    """Save the import run as a scraper log."""
    try:
        log = {
            "run_date": run_start,
            "import_id": summary.get("import_id"),
            "pdfs_found": summary.get("pdfs_found", 0),
            "pdfs_downloaded": summary.get("pdfs_downloaded", 0),
            "pdfs_skipped": summary.get("pdfs_skipped", 0),
            "cases_extracted": summary.get("cases_parsed", 0),
            "execution_time_seconds": summary.get("execution_time_seconds", 0),
            "status": summary.get("status", "unknown"),
            "error_message": summary.get("error_message"),
            "results": summary.get("results", []),
        }
        db["scraper_logs"].insert_one(log)
    except Exception:
        logger.error("Failed to save import log")
