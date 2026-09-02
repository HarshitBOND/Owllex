"""Quick-start script for Ravenslaw backend."""

import os

import uvicorn
from app.config import settings

if __name__ == "__main__":
    # Reload is opt-in rather than tied to DEBUG. A document extraction holds its request open
    # for ~90s, and a reload landing mid-extraction leaves uvicorn stuck in "waiting for
    # connections to close" -- the port stays bound but nothing is served, so the frontend sees
    # a hang rather than a clean error. DEBUG can't be reused as the off switch either: it also
    # gates the production CORS check in app/config.py.
    reload = os.getenv("RAVENSLAW_RELOAD", "").strip().lower() in ("1", "true", "yes")

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=reload,
        # Scoped so the watcher never walks the multi-GB .venv that `uv sync --extra rag`
        # creates next to this file (~45k files of torch/onnx weights).
        reload_dirs=["app", "rag"] if reload else None,
    )
