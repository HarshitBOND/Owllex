"""Process logging: stdout for journald, a rotating file for humans.

systemd already captures stdout into the journal, so the file handler is not
redundancy for its own sake -- it is what makes ``tail -f /var/log/owllex/rag.log``
work for someone who is not fluent in ``journalctl``, what survives a journal
vacuum, and what logrotate (deploy/logrotate/owllex) ages out on its own
schedule rather than the journal's global one.

Log files are chosen by *role*, not by process: the API writes rag.log, the
ingest worker writes ingest.log, the backup unit writes backup.log. Three
services writing three files means a question like "why did last night's backup
take four hours" is answered by opening one file, instead of by filtering a
single merged log for the right unit.

Falling back to stdout-only is deliberate and silent-ish (one warning): a box
where /var/log/owllex is not writable should still start and serve. Losing the
file log is an inconvenience; refusing to boot over it is an outage.
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
from pathlib import Path

# Shared by every process so a merged view (`cat /var/log/owllex/*.log | sort`)
# stays readable and machine-greppable.
LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Rotation is configured here as well as in logrotate: logrotate runs daily, and
# a bulk import can produce hundreds of MB in an afternoon. The size cap is what
# actually protects the root filesystem between logrotate runs.
MAX_BYTES = 50 * 1024 * 1024
BACKUP_COUNT = 5


def configure_logging(role: str = "rag", *, debug: bool = False) -> Path | None:
    """Install stdout + rotating-file handlers. Returns the log path, if any.

    Idempotent: re-running replaces the handlers rather than stacking a second
    copy of every line, which matters because uvicorn's reloader imports the app
    module more than once.
    """
    level = logging.DEBUG if debug else logging.INFO
    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        root.removeHandler(handler)
        # Only close handlers we own; closing a pytest/uvicorn stream handler
        # would take stdout with it.
        if isinstance(handler, logging.handlers.RotatingFileHandler):
            handler.close()

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(formatter)
    root.addHandler(stream)

    path = _log_path(role)
    if path is None:
        return None

    file_handler = logging.handlers.RotatingFileHandler(
        path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)

    # Uvicorn installs its own handlers on these; without propagate the access
    # and error logs would never reach the file.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    return path


def _log_path(role: str) -> Path | None:
    """Resolve LOG_ROOT/<role>.log, or None if it cannot be written."""
    raw = os.getenv("LOG_ROOT", "").strip()
    root = Path(raw).expanduser() if raw else Path("/var/log/owllex")

    try:
        root.mkdir(parents=True, exist_ok=True)
        probe = root / f".probe-{os.getpid()}"
        probe.write_bytes(b"")
        probe.unlink()
    except OSError as exc:
        logging.getLogger("ravenslaw").warning(
            "Log directory %s is not writable (%s); logging to stdout only", root, exc
        )
        return None

    return root / f"{role}.log"
