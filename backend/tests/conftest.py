"""
Test-session environment, set before any test module (or the modules it
imports) can import ``app.config``.

``app.config`` builds a frozen, module-level ``Settings()`` singleton at
import time, and refuses to construct without an explicit CORS/trusted-hosts
configuration outside debug mode. Whichever test module pytest happens to
collect first is the one that freezes this configuration for the whole
session -- so it has to be set here, in the one file pytest guarantees it
imports before collecting anything else.
"""

import os
import tempfile
from pathlib import Path

os.environ.setdefault("RAVENSLAW_DEBUG", "true")
os.environ.setdefault("RAVENSLAW_INTERNAL_TOKEN", "test-internal-token")
# TrustedHostMiddleware runs in front of every route, and TestClient sends
# Host: testserver -- without this the whole suite would measure the host
# check instead of whatever it's actually testing.
os.environ.setdefault("RAVENSLAW_TRUSTED_HOSTS", "testserver,localhost,127.0.0.1")
os.environ.setdefault(
    "RAVENSLAW_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
)
os.environ.setdefault("DATA_ROOT", str(Path(tempfile.mkdtemp(prefix="owllex_test_data_"))))
