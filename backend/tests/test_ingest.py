"""
Tests for the ingest pipeline (rag/ledger.py, rag/storage.py, rag/ingest.py).

Entirely offline — no R2 calls, no Docling models, no network. The expensive
stages are stubbed; what's under test is the dedup/resume bookkeeping that
decides whether those stages get to run at all.

Run:
    cd backend
    python tests/test_ingest.py
"""

import json
import os
import sys
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag import config, storage
from rag.ingest import ingest_one, read_manifest
from rag.ledger import EXTRACTED, FAILED, NEW, STORED, Ledger, open_ledger


class TestLedger(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "ledger.sqlite3"

    def tearDown(self):
        self.tmp.cleanup()

    def _add(self, led, h="a" * 64, doc_id="DOC1"):
        led.add(content_hash=h, doc_id=doc_id, source="sci",
                filename=f"{doc_id}.pdf", size_bytes=100, title="X v. Y")

    def test_seen_is_false_before_add(self):
        with open_ledger(self.path) as led:
            self.assertFalse(led.seen("a" * 64))
            self._add(led)
            self.assertTrue(led.seen("a" * 64))

    def test_hashes_survive_reopen(self):
        """The in-memory set is rebuilt from SQLite — that's what makes it durable."""
        with open_ledger(self.path) as led:
            self._add(led)
        with open_ledger(self.path) as reopened:
            self.assertTrue(reopened.seen("a" * 64))
            self.assertEqual(reopened.get("a" * 64)["status"], NEW)

    def test_add_is_idempotent(self):
        with open_ledger(self.path) as led:
            self._add(led)
            led.mark("a" * 64, EXTRACTED, pages=12)
            self._add(led)  # same hash again, must not reset progress
            self.assertEqual(led.get("a" * 64)["status"], EXTRACTED)
            self.assertEqual(sum(led.counts().values()), 1)

    def test_mark_sets_columns_and_counts(self):
        with open_ledger(self.path) as led:
            self._add(led, doc_id="DOC1")
            self._add(led, h="b" * 64, doc_id="DOC2")
            led.mark("a" * 64, STORED, r2_key="raw/sci/aaa.pdf")
            led.mark("b" * 64, FAILED, error="unreadable scan")

            self.assertEqual(led.get("a" * 64)["r2_key"], "raw/sci/aaa.pdf")
            self.assertEqual(led.counts(), {STORED: 1, FAILED: 1})
            self.assertEqual([r["doc_id"] for r in led.rows(status=FAILED)], ["DOC2"])

    def test_mark_rejects_unknown_column(self):
        """Column names interpolate into SQL, so they are whitelisted."""
        with open_ledger(self.path) as led:
            self._add(led)
            with self.assertRaises(ValueError):
                led.mark("a" * 64, STORED, **{"nonsense_column": 1})


class TestStorageKeys(unittest.TestCase):
    def test_key_is_content_addressed(self):
        h = sha256(b"pdf bytes").hexdigest()
        self.assertEqual(storage.object_key("sci", h), f"raw/sci/{h}.pdf")

    def test_metadata_is_header_safe(self):
        messy = "  National Insurance — Co. Ltd.\n versus  Smt.\tThungala  "
        cleaned = storage._header_safe(messy)
        self.assertNotIn("\n", cleaned)
        self.assertNotIn("\t", cleaned)
        self.assertTrue(cleaned.isascii())
        self.assertTrue(cleaned.startswith("National Insurance"))


class FakeExtraction:
    def __init__(self, markdown):
        self.markdown = markdown
        self.pages = 3

    @property
    def is_empty(self):
        return len(self.markdown.strip()) < 200


class TestIngestOne(unittest.TestCase):
    """Drives the orchestrator with Docling and R2 both stubbed out."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.raw, self.processed = root / "raw", root / "processed"
        (self.raw / "sci" / "pdfs").mkdir(parents=True)

        self._saved = (config.RAW_DIR, config.PROCESSED_DIR)
        config.RAW_DIR, config.PROCESSED_DIR = self.raw, self.processed

        self.pdf_bytes = b"%PDF-1.7 fake"
        (self.raw / "sci" / "pdfs" / "DOC1.pdf").write_bytes(self.pdf_bytes)
        self.hash = sha256(self.pdf_bytes).hexdigest()
        self.row = {"cnr": "DOC1", "filename": "DOC1.pdf", "title": "X v. Y", "hash": self.hash}

        self.led = Ledger(root / "ledger.sqlite3")

        # Stub Docling: record calls so we can assert it is skipped on rerun.
        from rag import extract as extract_mod

        self.extract_calls = []
        self._real_extract = extract_mod.extract_to_file

        def fake_extract(pdf_path, out_path):
            self.extract_calls.append(pdf_path.name)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            text = "JUDGMENT\n\n" + ("the court held that " * 40)
            out_path.write_text(text, encoding="utf-8")
            return FakeExtraction(text)

        extract_mod.extract_to_file = fake_extract
        self.extract_mod = extract_mod

    def tearDown(self):
        self.extract_mod.extract_to_file = self._real_extract
        self.led.close()
        config.RAW_DIR, config.PROCESSED_DIR = self._saved
        self.tmp.cleanup()

    def test_first_pass_ingests_and_records(self):
        self.assertEqual(ingest_one(self.row, "sci", self.led, None, True), "ingested")
        record = self.led.get(self.hash)
        self.assertEqual(record["status"], EXTRACTED)
        self.assertEqual(record["doc_id"], "DOC1")
        self.assertEqual(record["pages"], 3)
        self.assertTrue(Path(record["text_path"]).exists())

    def test_second_pass_skips_without_re_extracting(self):
        ingest_one(self.row, "sci", self.led, None, True)
        self.assertEqual(ingest_one(self.row, "sci", self.led, None, True), "skipped")
        self.assertEqual(len(self.extract_calls), 1, "Docling must not run twice")

    def test_duplicate_content_under_a_new_doc_id_is_skipped(self):
        """Same judgment served under a second CNR: dedup is by content, not id."""
        ingest_one(self.row, "sci", self.led, None, True)
        (self.raw / "sci" / "pdfs" / "DOC2.pdf").write_bytes(self.pdf_bytes)
        duplicate = dict(self.row, cnr="DOC2", filename="DOC2.pdf")
        self.assertEqual(ingest_one(duplicate, "sci", self.led, None, True), "skipped")
        self.assertEqual(sum(self.led.counts().values()), 1)

    def test_r2_backfills_a_document_extracted_before_it_was_configured(self):
        """Extract-only first (no R2 yet), then configure R2: the PDF still uploads."""
        calls = []
        real_upload = storage.upload_pdf
        storage.upload_pdf = lambda s3, key, data, metadata=None: calls.append(key)
        try:
            self.assertEqual(ingest_one(self.row, "sci", self.led, None, True), "ingested")
            self.assertEqual(self.led.get(self.hash)["status"], EXTRACTED)
            self.assertEqual(calls, [])

            self.assertEqual(ingest_one(self.row, "sci", self.led, object(), True), "ingested")
            self.assertEqual(calls, [f"raw/sci/{self.hash}.pdf"])
            # Backfilling storage must not walk the status back to `stored`.
            self.assertEqual(self.led.get(self.hash)["status"], EXTRACTED)
            self.assertEqual(len(self.extract_calls), 1, "Docling must not run again")
        finally:
            storage.upload_pdf = real_upload

    def test_missing_pdf_is_a_failure_not_a_crash(self):
        row = dict(self.row, cnr="GONE", filename="GONE.pdf")
        self.assertEqual(ingest_one(row, "sci", self.led, None, True), "failed")

    def test_empty_extraction_is_recorded_as_failed(self):
        self.extract_mod.extract_to_file = lambda p, o: FakeExtraction("")
        self.assertEqual(ingest_one(self.row, "sci", self.led, None, True), "failed")
        self.assertIn("almost no text", self.led.get(self.hash)["error"])

    def test_upload_only_leaves_document_resumable(self):
        """--no-extract stops at `stored`; the next full run finishes the job."""
        calls = []

        class FakeS3:
            pass

        def fake_upload(s3, key, data, metadata=None):
            calls.append(key)
            return True

        real_upload = storage.upload_pdf
        storage.upload_pdf = fake_upload
        try:
            self.assertEqual(ingest_one(self.row, "sci", self.led, FakeS3(), False), "ingested")
            self.assertEqual(self.led.get(self.hash)["status"], STORED)
            self.assertEqual(calls, [f"raw/sci/{self.hash}.pdf"])
            self.assertEqual(self.extract_calls, [])

            # Rerun with extraction on: r2_key is already set, so no re-upload.
            self.assertEqual(ingest_one(self.row, "sci", self.led, FakeS3(), True), "ingested")
            self.assertEqual(self.led.get(self.hash)["status"], EXTRACTED)
            self.assertEqual(len(calls), 1, "already-stored PDF must not re-upload")
        finally:
            storage.upload_pdf = real_upload


class TestManifest(unittest.TestCase):
    def test_reads_lines_and_ignores_blanks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.jsonl"
            path.write_text(
                json.dumps({"cnr": "A", "filename": "A.pdf"}) + "\n\n"
                + json.dumps({"cnr": "B", "filename": "B.pdf"}) + "\n",
                encoding="utf-8",
            )
            self.assertEqual([r["cnr"] for r in read_manifest(path)], ["A", "B"])

    def test_missing_manifest_says_what_to_do(self):
        with self.assertRaises(FileNotFoundError) as ctx:
            list(read_manifest(Path("nope/manifest.jsonl")))
        self.assertIn("run the scraper first", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
