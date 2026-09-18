"""
Tests for PRODUCTION_TODO.md T19a: the in-process rate limiter's memory bound
(app/main.py::_RateLimiter) and opaque 5xx error responses (app/rag_routes.py).

Entirely offline, real FastAPI stack for the HTTP-level tests -- the same
"real stack on a temp DATA_ROOT" pattern tests/test_user_documents.py uses,
with the RAG dependency layer's own auth (the internal token) rather than a
Clerk override.

Run:
    cd backend
    .venv/bin/python -m pytest tests/test_hardening.py -q
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import _RateLimiter  # noqa: E402
from rag.core import services as services_module  # noqa: E402
from rag.core.config import RagConfig, set_config  # noqa: E402
from rag.core.embeddings import DeterministicEmbedder  # noqa: E402

INTERNAL_TOKEN = "test-internal-token"  # matches tests/conftest.py


# ─── Bug A: the rate limiter's memory bound ──────────────────────────────────


class TestRateLimiterMemoryBound(unittest.TestCase):
    """PRODUCTION_TODO.md T19a, Bug A: the outer dict must never grow without
    bound, however many distinct client IPs have ever been seen."""

    def test_10000_distinct_ips_stay_within_the_tracked_cap(self):
        """The literal shape of this task's own Verify: drive many distinct
        client identities through the limiter and assert the tracked count
        stays bounded, rather than growing by one entry per IP forever."""
        limiter = _RateLimiter(
            window_seconds=60, max_requests=120, max_tracked_ips=500, sweep_every=1000
        )
        for i in range(10_000):
            self.assertTrue(limiter.allow(f"203.0.113.{i % 256}.{i // 256}"))
        self.assertLessEqual(len(limiter), 500)

    def test_the_periodic_sweep_alone_also_bounds_memory_between_cap_checks(self):
        """Even with a cap far above what a burst would hit, the sweep must
        actually drop buckets whose newest entry has aged out of the window
        -- not just rely on the cap to do all the work."""
        limiter = _RateLimiter(
            window_seconds=1, max_requests=120, max_tracked_ips=1_000_000, sweep_every=100
        )
        t = 1_000_000.0
        for i in range(500):
            limiter.allow(f"198.51.100.{i % 256}.{i // 256}", now=t)
        self.assertEqual(len(limiter), 500)

        # Far past the 1-second window, and past sweep_every requests -- every
        # stale bucket from the first batch must be gone, not merely trimmed.
        for i in range(500):
            limiter.allow(f"192.0.2.{i % 256}.{i // 256}", now=t + 100)
        self.assertEqual(len(limiter), 500, "the sweep did not evict the aged-out first batch")

    def test_a_request_still_within_the_window_is_not_swept(self):
        """The sweep must not be trigger-happy -- an IP that is still active
        stays tracked."""
        limiter = _RateLimiter(
            window_seconds=60, max_requests=120, max_tracked_ips=10, sweep_every=1
        )
        limiter.allow("203.0.113.1", now=1000.0)
        limiter.allow("203.0.113.2", now=1010.0)  # triggers a sweep at window=60s
        self.assertEqual(len(limiter), 2)

    def test_the_limit_itself_is_unchanged_by_the_bounding_work(self):
        """Bug A is about the *tracked-IP* dict, not the per-IP request
        count -- a single IP must still be refused past max_requests."""
        limiter = _RateLimiter(window_seconds=60, max_requests=3, max_tracked_ips=10)
        results = [limiter.allow("203.0.113.9", now=1000.0 + i) for i in range(5)]
        self.assertEqual(results, [True, True, True, False, False])

    def test_lru_eviction_drops_the_least_recently_used_ip_first(self):
        limiter = _RateLimiter(window_seconds=3600, max_requests=120, max_tracked_ips=2)
        limiter.allow("1.1.1.1", now=1000.0)
        limiter.allow("2.2.2.2", now=1001.0)
        limiter.allow("3.3.3.3", now=1002.0)  # over cap -> evicts 1.1.1.1
        self.assertEqual(len(limiter), 2)
        self.assertNotIn("1.1.1.1", limiter._buckets)
        self.assertIn("2.2.2.2", limiter._buckets)
        self.assertIn("3.3.3.3", limiter._buckets)


# ─── Bug B: opaque 5xx error responses ───────────────────────────────────────


class RagHttpTestCase(unittest.TestCase):
    """A real FastAPI app + real RAG stack on a temp DATA_ROOT."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="rag_test_hardening_"))
        env = {
            "DATA_ROOT": str(self.root),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
            "FAISS_FLUSH_EVERY": "1",
        }
        self._previous_env = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        self.config = RagConfig.from_env()
        set_config(self.config)
        self.services = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=64)
        )
        services_module.startup(self.services)
        services_module.set_services(self.services)

        from app.main import app

        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        services_module.shutdown(self.services)
        services_module.set_services(None)
        set_config(None)
        shutil.rmtree(self.root, ignore_errors=True)
        for key, value in self._previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _headers(self):
        return {"X-Internal-Token": INTERNAL_TOKEN}


class TestOpaqueSearchErrors(RagHttpTestCase):
    def test_a_forced_500_carries_no_filesystem_path_or_exception_text(self):
        """PRODUCTION_TODO.md T19a, Bug B, this task's own Verify: force a
        failure inside search and assert the response body is a fixed
        message plus a correlation id, not `f"Search failed: {exc}"`."""
        secret_path = "/mnt/hdd/owllex/faiss/owllex.faiss"
        secret_detail = f"failed to mmap {secret_path}: No such file or directory"
        with mock.patch(
            "rag.app.retrieval.retriever.Retriever.search_public",
            side_effect=RuntimeError(secret_detail),
        ):
            response = self.client.post(
                "/api/v1/rag/search",
                json={"query": "test query", "k": 3},
                headers=self._headers(),
            )

        self.assertEqual(response.status_code, 500)
        body = response.json()
        self.assertNotIn(secret_path, body["detail"])
        self.assertNotIn("RuntimeError", body["detail"])
        self.assertNotIn(secret_detail, body["detail"])
        self.assertEqual(body["detail"], body["detail"])  # sanity: JSON, not raw text
        self.assertTrue(body["detail"].startswith("Search failed"))
        self.assertIn("(reference:", body["detail"])

    def test_a_forced_503_from_a_broken_services_container_is_also_opaque(self):
        """The `_services()` failure path (a different site, same Bug B
        shape) -- also must not leak the underlying exception."""
        secret_detail = "could not open /srv/owllex/ssd/sqlite/chunks.db: disk I/O error"
        with mock.patch(
            "rag.core.services.get_services", side_effect=RuntimeError(secret_detail),
        ):
            response = self.client.post(
                "/api/v1/rag/search",
                json={"query": "test query", "k": 3},
                headers=self._headers(),
            )

        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertNotIn(secret_detail, body["detail"])
        self.assertNotIn("chunks.db", body["detail"])
        self.assertIn("(reference:", body["detail"])

    def test_two_forced_failures_get_different_correlation_ids(self):
        """A correlation id that never changes would be useless for joining a
        specific response back to a specific log line."""
        with mock.patch(
            "rag.app.retrieval.retriever.Retriever.search_public",
            side_effect=RuntimeError("boom"),
        ):
            first = self.client.post(
                "/api/v1/rag/search", json={"query": "a", "k": 1}, headers=self._headers()
            ).json()["detail"]
            second = self.client.post(
                "/api/v1/rag/search", json={"query": "b", "k": 1}, headers=self._headers()
            ).json()["detail"]
        self.assertNotEqual(first, second)

    def test_a_successful_search_is_unaffected(self):
        """The opaque-error path must not fire, or change the response
        shape, on the ordinary success path."""
        response = self.client.post(
            "/api/v1/rag/search", json={"query": "test query", "k": 3}, headers=self._headers()
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_missing_dependencies_message_is_unchanged_by_this_task(self):
        """The task explicitly says to keep the _MISSING_DEPENDENCIES 503
        text as-is -- it is already fixed and actionable and names no
        internals, unlike the sites this task rewrites.

        This is specifically the `from rag.core.services import get_services`
        import failing (the RAG extra genuinely not installed) -- a plain
        `mock.patch("rag.core.services.get_services", side_effect=ImportError)`
        would instead make an already-imported `get_services` raise when
        *called*, which lands in `_services()`'s second `except Exception`
        branch (the now-opaque "RAG storage is unavailable" 503), not the
        first `except ImportError` branch this test means to exercise -- so
        this patches the `import` machinery itself, at the unit level rather
        than through HTTP, to raise for that one module name."""
        from fastapi import HTTPException

        from app.rag_routes import _services

        real_import = __import__

        def fake_import(name, *args, **kwargs):
            if name == "rag.core.services":
                raise ImportError("No module named 'faiss'")
            return real_import(name, *args, **kwargs)

        with mock.patch("builtins.__import__", side_effect=fake_import):
            with self.assertRaises(HTTPException) as ctx:
                _services()

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIn("uv sync --extra rag", ctx.exception.detail)
        # And, per the same fix, the ImportError text is no longer appended.
        self.assertNotIn("faiss", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
