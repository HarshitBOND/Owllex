"""Tests for private user-document storage: ownership, isolation and traversal.

The point of this file is the *negative* space. Anyone can write a test proving
an upload comes back down again; what matters here is that a second user cannot
fetch the first user's document, that an unauthenticated caller cannot fetch
anything, and that a hostile ``document_id``, ``category``, ``owner_id`` or
``storage_path`` cannot address a byte outside ``USERS_ROOT``.

Entirely offline: no Clerk, no network, no model. The JWT verification is
replaced with a dependency override, because what is under test is what the
routes do *with* an identity, not how the identity is proved -- and a test that
had to mint real tokens would be a test nobody runs.

Run:
    cd backend
    .venv/bin/python tests/test_user_documents.py
"""

import io
import os
import shutil
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# The test-session environment (RAVENSLAW_DEBUG, RAVENSLAW_TRUSTED_HOSTS,
# DATA_ROOT, ...) is set in tests/conftest.py, which pytest imports before
# collecting this module -- see that file for why it has to live there.

from fastapi.testclient import TestClient  # noqa: E402

from rag.core import services as services_module  # noqa: E402
from rag.core.config import RagConfig, set_config  # noqa: E402
from rag.core.embeddings import DeterministicEmbedder  # noqa: E402
from rag.core.user_document_store import QuotaExceeded, UserDocumentStore  # noqa: E402
from rag.core.user_paths import (  # noqa: E402
    CATEGORIES,
    UnsafePathError,
    is_document_id,
    new_document_id,
    owner_segment,
    sanitize_filename,
    user_document_relative_path,
)

ALICE = "user_2aliceAAAAAAAAAAAAAAAAAA"
BOB = "user_2bobBBBBBBBBBBBBBBBBBBBB"

PDF_BYTES = b"%PDF-1.7\n" + b"0" * 2048 + b"\n%%EOF\n"


def docx_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document/>")
    return buffer.getvalue()


class UserDocumentTestCase(unittest.TestCase):
    """A real stack on a temp volume, with a stubbed authenticated identity."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="userdocs_"))
        self.config = self._config()
        set_config(self.config)
        self.services = services_module.build_services(
            self.config, embedder=DeterministicEmbedder(dimension=self.config.embed_dim)
        )
        services_module.startup(self.services)
        services_module.set_services(self.services)

        from app.document_routes import _require_reader
        from app.main import app
        from app.security import require_authenticated_user

        self.app = app
        self.caller = ALICE
        # The routes resolve the caller from these dependencies' return values,
        # so overriding them here is exactly the seam a real Clerk token goes
        # through. Both are listed because FastAPI keys overrides on the exact
        # callable a route declared, and the corpus route declares its own.
        app.dependency_overrides[require_authenticated_user] = lambda: self.caller
        app.dependency_overrides[_require_reader] = lambda: self.caller
        self.client = TestClient(app)

    def _drop_auth_overrides(self):
        """Restore the real credential checks for the unauthenticated cases."""
        from app.document_routes import _require_reader
        from app.security import require_authenticated_user

        self.app.dependency_overrides.pop(require_authenticated_user, None)
        self.app.dependency_overrides.pop(_require_reader, None)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        services_module.shutdown(self.services)
        services_module.set_services(None)
        set_config(None)
        shutil.rmtree(self.root, ignore_errors=True)

    def _config(self, **overrides) -> RagConfig:
        env = {
            "DATA_ROOT": str(self.root),
            "EMBED_MODEL": "deterministic-test",
            "EMBED_DIM": "64",
            "PARSER_BACKEND": "pypdfium",
            "RAVENSLAW_UPLOAD_DIR": str(self.root / "tmp" / "uploads"),
        }
        env.update({k: str(v) for k, v in overrides.items()})
        previous = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            Path(env["RAVENSLAW_UPLOAD_DIR"]).mkdir(parents=True, exist_ok=True)
            return RagConfig.from_env()
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _upload(self, *, owner=ALICE, category="contracts", name="brief.pdf",
                content=PDF_BYTES, mime="application/pdf"):
        self.caller = owner
        # The route reads settings.UPLOAD_DIR, which was resolved at import from
        # the process environment rather than from this test's config.
        from app.config import settings

        Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        return self.client.post(
            "/api/user-documents",
            files={"file": (name, content, mime)},
            data={"category": category},
        )


class UploadTests(UserDocumentTestCase):
    def test_upload_returns_metadata_without_any_filesystem_path(self):
        response = self._upload()
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()

        self.assertEqual(body["category"], "contracts")
        self.assertEqual(body["filename"], "brief.pdf")
        self.assertEqual(body["mime_type"], "application/pdf")
        self.assertEqual(body["file_size"], len(PDF_BYTES))
        self.assertTrue(is_document_id(body["document_id"]))
        self.assertTrue(body["created_at"])

        # The contract that matters: nothing in the response, at any depth,
        # mentions where the volume keeps the file.
        serialised = response.text
        self.assertNotIn("storage_path", serialised)
        self.assertNotIn(str(self.config.users_root), serialised)
        self.assertNotIn("/data", serialised)

    def test_file_lands_in_the_owner_and_category_directory(self):
        document_id = self._upload(category="affidavits").json()["document_id"]
        expected = (
            self.config.users_root / owner_segment(ALICE) / "affidavits" / f"{document_id}.pdf"
        )
        self.assertTrue(expected.is_file())
        self.assertEqual(expected.read_bytes(), PDF_BYTES)

    def test_stored_files_and_directories_are_owner_only(self):
        document_id = self._upload().json()["document_id"]
        path = self.config.users_root / owner_segment(ALICE) / "contracts" / f"{document_id}.pdf"
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(path.parent.parent.stat().st_mode & 0o777, 0o700)

    def test_docx_is_accepted_and_stored_under_its_real_extension(self):
        response = self._upload(
            name="agreement.docx",
            content=docx_bytes(),
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertEqual(response.status_code, 201, response.text)
        document_id = response.json()["document_id"]
        self.assertTrue(
            (self.config.users_root / owner_segment(ALICE) / "contracts" / f"{document_id}.docx").is_file()
        )

    def test_extension_follows_the_bytes_not_the_declared_name(self):
        """A DOCX uploaded as ``.pdf`` is stored, and served, as a DOCX."""
        response = self._upload(name="disguised.pdf", content=docx_bytes(), mime="application/pdf")
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(
            body["mime_type"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertTrue(
            (self.config.users_root / owner_segment(ALICE) / "contracts"
             / f"{body['document_id']}.docx").is_file()
        )

    def test_executable_content_is_rejected_whatever_it_is_called(self):
        response = self._upload(name="invoice.pdf", content=b"\x7fELF\x02\x01\x01" + b"\x00" * 64)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(any((self.config.users_root).rglob("*.pdf")))

    def test_html_disguised_as_pdf_is_rejected(self):
        response = self._upload(content=b"<html><script>alert(1)</script></html>")
        self.assertEqual(response.status_code, 400)

    def test_unknown_category_is_rejected_rather_than_defaulted(self):
        response = self._upload(category="../../etc")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(list(self.config.users_root.rglob("*.pdf")))

    def test_every_documented_category_is_accepted(self):
        for category in CATEGORIES:
            with self.subTest(category=category):
                response = self._upload(category=category)
                self.assertEqual(response.status_code, 201, response.text)
                self.assertEqual(response.json()["category"], category)

    def test_empty_upload_is_rejected(self):
        self.assertEqual(self._upload(content=b"").status_code, 400)

    def test_oversized_upload_is_rejected(self):
        oversized = PDF_BYTES + b"0" * (self.config.max_user_document_mb * 1024 * 1024)
        self.assertEqual(self._upload(content=oversized).status_code, 413)
        self.assertFalse(list(self.config.users_root.rglob("*.pdf")))

    def test_hostile_filename_is_sanitised_before_it_is_stored(self):
        response = self._upload(name="../../../etc/passwd.pdf")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["filename"], "passwd.pdf")


class OwnershipTests(UserDocumentTestCase):
    def test_owner_can_download_their_own_document(self):
        document_id = self._upload().json()["document_id"]
        response = self.client.get(f"/api/user-documents/{document_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, PDF_BYTES)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertIn("no-store", response.headers["cache-control"])

    def test_another_user_is_refused_with_403(self):
        document_id = self._upload(owner=ALICE).json()["document_id"]

        self.caller = BOB
        response = self.client.get(f"/api/user-documents/{document_id}")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(b"%PDF", response.content)

    def test_another_user_cannot_delete_it(self):
        document_id = self._upload(owner=ALICE).json()["document_id"]

        self.caller = BOB
        self.assertEqual(
            self.client.delete(f"/api/user-documents/{document_id}").status_code, 403
        )

        self.caller = ALICE
        self.assertEqual(self.client.get(f"/api/user-documents/{document_id}").status_code, 200)

    def test_another_user_cannot_see_it_in_a_listing(self):
        self._upload(owner=ALICE)
        self.caller = BOB
        body = self.client.get("/api/user-documents").json()
        self.assertEqual(body["documents"], [])
        self.assertEqual(body["usage"]["document_count"], 0)

    def test_a_missing_document_is_indistinguishable_from_someone_elses(self):
        """The 403 must not become an oracle for which ids exist."""
        owned = self._upload(owner=ALICE).json()["document_id"]

        self.caller = BOB
        theirs = self.client.get(f"/api/user-documents/{owned}")
        absent = self.client.get(f"/api/user-documents/{new_document_id()}")

        self.assertEqual(theirs.status_code, absent.status_code)
        self.assertEqual(theirs.json(), absent.json())

    def test_unauthenticated_callers_are_refused(self):
        document_id = self._upload().json()["document_id"]

        # Drop the overrides so the real Clerk dependency runs. With no
        # Authorization header it must refuse before touching any storage.
        self._drop_auth_overrides()
        with TestClient(self.app) as anonymous:
            for method, url in (
                ("get", f"/api/user-documents/{document_id}"),
                ("get", "/api/user-documents"),
                ("delete", f"/api/user-documents/{document_id}"),
            ):
                with self.subTest(url=url):
                    response = getattr(anonymous, method)(url)
                    self.assertEqual(response.status_code, 401)

            self.assertEqual(
                anonymous.post(
                    "/api/user-documents",
                    files={"file": ("x.pdf", PDF_BYTES, "application/pdf")},
                ).status_code,
                401,
            )

    def test_deleting_removes_both_the_row_and_the_file(self):
        document_id = self._upload().json()["document_id"]
        path = self.config.users_root / owner_segment(ALICE) / "contracts" / f"{document_id}.pdf"
        self.assertTrue(path.is_file())

        self.assertEqual(self.client.delete(f"/api/user-documents/{document_id}").status_code, 200)
        self.assertFalse(path.exists())
        self.assertIsNone(self.services.metadata.get_owned_document(document_id, ALICE))
        self.assertEqual(self.client.get(f"/api/user-documents/{document_id}").status_code, 403)

    def test_listing_is_scoped_and_filterable(self):
        first = self._upload(category="contracts").json()["document_id"]
        second = self._upload(category="evidence").json()["document_id"]
        self._upload(owner=BOB, category="contracts")

        self.caller = ALICE
        everything = self.client.get("/api/user-documents").json()["documents"]
        self.assertEqual({d["document_id"] for d in everything}, {first, second})

        contracts = self.client.get("/api/user-documents?category=contracts").json()["documents"]
        self.assertEqual([d["document_id"] for d in contracts], [first])


class TraversalTests(UserDocumentTestCase):
    def test_hostile_document_ids_never_reach_the_filesystem(self):
        secret = self.root / "secret.txt"
        secret.write_text("classified")

        for hostile in (
            "../../../etc/passwd",
            "..%2f..%2fsecret.txt",
            "....//....//secret.txt",
            f"{owner_segment(ALICE)}/contracts/../../../secret.txt",
            "%2e%2e%2fsecret.txt",
            "\\..\\..\\secret.txt",
            "a" * 300,
            # "" is deliberately absent: /api/user-documents/ is the listing
            # route, not a document id, and it is covered by the listing tests.
        ):
            with self.subTest(document_id=hostile):
                response = self.client.get(f"/api/user-documents/{hostile}")
                self.assertIn(response.status_code, (403, 404, 405))
                self.assertNotIn(b"classified", response.content)

    def test_store_refuses_a_storage_path_that_escapes_the_root(self):
        store = UserDocumentStore(self.config)
        outside = self.root / "outside.pdf"
        outside.write_bytes(PDF_BYTES)

        for hostile in ("../outside.pdf", "/etc/passwd", "a/../../outside.pdf"):
            with self.subTest(path=hostile):
                with self.assertRaises(UnsafePathError):
                    store.resolve(hostile)

    def test_store_refuses_a_row_whose_owner_and_path_disagree(self):
        """A hand-edited or badly migrated row must fail closed."""
        document_id = self._upload(owner=ALICE).json()["document_id"]
        record = self.services.metadata.get_owned_document(document_id, ALICE)

        with self.assertRaises(UnsafePathError):
            self.services.user_documents.resolve(record.storage_path, owner_id=BOB)

    def test_path_builder_rejects_ids_it_did_not_mint(self):
        for hostile in ("../etc", "..", "a/b", "", "x" * 64, "9f" * 20):
            with self.subTest(document_id=hostile):
                with self.assertRaises(UnsafePathError):
                    user_document_relative_path(ALICE, "contracts", hostile, ".pdf")

    def test_owner_segment_is_injective_and_never_a_path(self):
        segments = {}
        for owner in ("../../evil", "a/b", "a_b", "C:\\windows", "user_normal"):
            segment = owner_segment(owner)
            self.assertNotIn("/", segment)
            self.assertNotIn("\\", segment)
            self.assertNotIn("..", segment)
            segments[owner] = segment

        # Injective: two different owner ids never collapse into one directory.
        self.assertEqual(len(set(segments.values())), len(segments))

        for empty in ("", "   ", None):
            with self.subTest(owner=empty):
                with self.assertRaises(UnsafePathError):
                    owner_segment(empty)

    def test_filename_sanitiser_strips_separators_and_header_breakers(self):
        self.assertEqual(sanitize_filename("../../etc/passwd"), "passwd")
        self.assertEqual(sanitize_filename('a"b\r\nX-Evil: 1.pdf'), "abX-Evil_ 1.pdf")
        self.assertEqual(sanitize_filename("C:\\Users\\me\\deed.pdf"), "deed.pdf")
        self.assertEqual(sanitize_filename(""), "document")
        self.assertEqual(sanitize_filename("..."), "document")
        # A fullwidth solidus is a separator once normalised.
        self.assertNotIn("/", sanitize_filename("a\uff0fb.pdf"))


class DatabaseInvariantTests(UserDocumentTestCase):
    def test_a_public_row_cannot_carry_an_owner(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.services.metadata.connection.execute(
                "INSERT INTO documents (document_id, collection, visibility, owner_id, "
                "created_at, updated_at) VALUES ('d1','c','public','someone','t','t')"
            )

    def test_a_private_row_needs_owner_category_and_path(self):
        for columns, values in (
            ("visibility", "'private'"),
            ("visibility, owner_id", "'private','u'"),
            ("visibility, owner_id, category", "'private','u','contracts'"),
        ):
            with self.subTest(columns=columns):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.services.metadata.connection.execute(
                        f"INSERT INTO documents (document_id, collection, {columns}, "
                        f"created_at, updated_at) VALUES ('x','c',{values},'t','t')"
                    )

    def test_a_private_row_cannot_hold_an_absolute_or_traversing_path(self):
        for path in ("/etc/passwd", "../../etc/passwd"):
            with self.subTest(path=path):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.services.metadata.connection.execute(
                        "INSERT INTO documents (document_id, collection, visibility, owner_id, "
                        "category, storage_path, created_at, updated_at) "
                        "VALUES ('x','c','private','u','contracts',?,'t','t')",
                        (path,),
                    )

    def test_a_private_document_cannot_be_reparented(self):
        document_id = self._upload(owner=ALICE).json()["document_id"]
        for column, value in (
            ("owner_id", BOB),
            ("storage_path", f"{owner_segment(BOB)}/contracts/x.pdf"),
            ("visibility", "public"),
        ):
            with self.subTest(column=column):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.services.metadata.connection.execute(
                        f"UPDATE documents SET {column} = ? WHERE document_id = ?",
                        (value, document_id),
                    )

    def test_a_corpus_purge_cannot_reach_private_rows(self):
        document_id = self._upload(owner=ALICE).json()["document_id"]
        self.services.metadata.delete_documents("user_documents", clerk_uid=ALICE)
        self.services.metadata.delete_documents("user_documents", document_id=document_id)
        self.assertIsNotNone(self.services.metadata.get_owned_document(document_id, ALICE))


class PublicCorpusTests(UserDocumentTestCase):
    def _archive_public_document(self, document_id="corpus_doc_1") -> str:
        relative = f"sci/2026/{'a' * 64}.pdf"
        destination = self.config.legal_corpus_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(PDF_BYTES)
        self.services.metadata.upsert_document(
            document_id=document_id,
            collection="lexvert",
            court="sci",
            title="Kumar v. State",
            file_path=relative,
        )
        return document_id

    def test_public_corpus_document_streams_to_an_authenticated_user(self):
        document_id = self._archive_public_document()
        response = self.client.get(f"/api/documents/{document_id}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.content, PDF_BYTES)

    def test_public_route_will_not_serve_a_private_document(self):
        document_id = self._upload(owner=ALICE).json()["document_id"]
        response = self.client.get(f"/api/documents/{document_id}")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"%PDF", response.content)

    def test_public_route_will_not_serve_a_users_own_research_corpus(self):
        relative = f"upload/2026/{'b' * 64}.pdf"
        destination = self.config.legal_corpus_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(PDF_BYTES)
        self.services.metadata.upsert_document(
            document_id="private_corpus_doc",
            collection="corpus",
            file_path=relative,
            corpus_id="c1",
            clerk_uid=BOB,
        )
        self.assertEqual(self.client.get("/api/documents/private_corpus_doc").status_code, 404)

    def test_public_route_requires_a_credential(self):
        document_id = self._archive_public_document()

        self._drop_auth_overrides()
        with TestClient(self.app) as anonymous:
            self.assertEqual(anonymous.get(f"/api/documents/{document_id}").status_code, 401)
            # The Next app's server-to-server path keeps working.
            self.assertEqual(
                anonymous.get(
                    f"/api/documents/{document_id}",
                    headers={"X-Internal-Token": "test-internal-token"},
                ).status_code,
                200,
            )
            self.assertEqual(
                anonymous.get(
                    f"/api/documents/{document_id}",
                    headers={"X-Internal-Token": "wrong"},
                ).status_code,
                401,
            )


class StreamingTests(UserDocumentTestCase):
    def test_range_requests_are_honoured(self):
        document_id = self._upload().json()["document_id"]

        response = self.client.get(
            f"/api/user-documents/{document_id}", headers={"Range": "bytes=0-9"}
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PDF_BYTES[:10])
        self.assertEqual(
            response.headers["content-range"], f"bytes 0-9/{len(PDF_BYTES)}"
        )

    def test_a_suffix_range_returns_the_tail(self):
        document_id = self._upload().json()["document_id"]
        response = self.client.get(
            f"/api/user-documents/{document_id}", headers={"Range": "bytes=-8"}
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, PDF_BYTES[-8:])

    def test_an_unsatisfiable_range_is_refused(self):
        document_id = self._upload().json()["document_id"]
        response = self.client.get(
            f"/api/user-documents/{document_id}", headers={"Range": "bytes=999999-"}
        )
        self.assertEqual(response.status_code, 416)

    def test_range_support_is_advertised(self):
        document_id = self._upload().json()["document_id"]
        response = self.client.get(f"/api/user-documents/{document_id}")
        self.assertEqual(response.headers.get("accept-ranges"), "bytes")

    def test_content_disposition_carries_the_original_name_safely(self):
        document_id = self._upload(name="Lease Agreement.pdf").json()["document_id"]
        header = self.client.get(f"/api/user-documents/{document_id}").headers["content-disposition"]
        self.assertIn('filename="Lease Agreement.pdf"', header)
        self.assertIn("filename*=UTF-8''", header)
        self.assertNotIn("\n", header)

    def test_a_missing_file_behind_a_valid_row_is_a_404_not_a_crash(self):
        document_id = self._upload().json()["document_id"]
        record = self.services.metadata.get_owned_document(document_id, ALICE)
        (self.config.users_root / record.storage_path).unlink()

        self.assertEqual(self.client.get(f"/api/user-documents/{document_id}").status_code, 404)


class QuotaTests(UserDocumentTestCase):
    def test_document_count_ceiling_is_enforced(self):
        store = UserDocumentStore(self._config(MAX_USER_DOCUMENTS_PER_OWNER=1))
        source = self.root / "q.pdf"
        source.write_bytes(PDF_BYTES)
        store.store(
            source, document_id=new_document_id(), owner_id=ALICE, category="contracts"
        )
        with self.assertRaises(QuotaExceeded):
            store.enforce_quota(ALICE, len(PDF_BYTES))

    def test_byte_ceiling_is_enforced(self):
        config = self._config(USER_QUOTA_MB=1)
        store = UserDocumentStore(config)
        with self.assertRaises(QuotaExceeded):
            store.enforce_quota(ALICE, 2 * 1024 * 1024)
        store.enforce_quota(ALICE, 1024)  # comfortably under: must not raise

    def test_one_owners_usage_does_not_count_anothers(self):
        self._upload(owner=ALICE)
        self._upload(owner=BOB)
        self.assertEqual(self.services.user_documents.owner_usage(ALICE).document_count, 1)
        self.assertEqual(self.services.user_documents.owner_usage(BOB).document_count, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
