"""
Tests for the recipe-driven scraper (rag/scrapping).

Entirely offline cURL parsing, selector extraction, pagination maths, block
detection and dedup all run against fixtures, so this suite never touches a
government server.

Run:
    cd backend
    python tests/test_scrapping.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag.scrapping.curl_import import parse_cookie_header, parse_curl
from rag.scrapping.extract import (
    find_documents,
    find_next_link,
    looks_like_pdf,
    query_page_url,
)
from rag.scrapping.models import FieldRule, Pagination, Recipe
from rag.scrapping.store import _reject_if_not_a_document, _safe_name
from rag.scrapping.store import DownloadRejected


CHROME_BASH_CURL = r"""curl 'https://ecourts.example.gov.in/search?p=results' \
  -H 'accept: text/html,application/xhtml+xml' \
  -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
  -H 'cookie: PHPSESSID=abc123def; JSESSIONID=xyz789' \
  -H 'Accept-Encoding: gzip, deflate, br' \
  -H 'Content-Length: 48' \
  --data-raw 'state_code=26&pageNo=1&captcha=8f3k2' \
  --compressed"""

CHROME_CMD_CURL = (
    'curl "https://x.example.gov.in/s" ^\n'
    '  -H "cookie: a=1; b=2" ^\n'
    '  --data-raw "page=1&q=test"'
)

LISTING_HTML = """
<html><body>
<table class="results"><tbody>
  <tr>
    <td>WP(C) 1234/2023</td>
    <td><a href="/files/judgment_a.pdf">Sharma v. State</a></td>
    <td>Decided on 14/03/2024</td>
  </tr>
  <tr>
    <td>CRL.A. 99/2022</td>
    <td><a href="/files/judgment_b.pdf">Kumar v. Union of India</a></td>
    <td>Decided on 02/11/2023</td>
  </tr>
  <tr>
    <td>MISC</td>
    <td><a href="/help/about.html">About this site</a></td>
    <td>n/a</td>
  </tr>
</tbody></table>
<a rel="next" href="/search?page=2">Next</a>
</body></html>
"""


class TestCurlImport(unittest.TestCase):
    def test_parses_chrome_bash_flavour(self):
        req = parse_curl(CHROME_BASH_CURL)
        self.assertEqual(req.method, "POST")
        self.assertEqual(req.url, "https://ecourts.example.gov.in/search?p=results")
        self.assertEqual(req.cookies["PHPSESSID"], "abc123def")
        self.assertEqual(req.cookies["JSESSIONID"], "xyz789")
        self.assertEqual(req.body, "state_code=26&pageNo=1&captcha=8f3k2")

    def test_drops_headers_requests_must_recompute(self):
        # Keeping the copied Content-Length or Accept-Encoding produces a
        # mangled body once we re-encode the request.
        req = parse_curl(CHROME_BASH_CURL)
        for header in ("Accept-Encoding", "Content-Length"):
            self.assertNotIn(header, req.headers)
        self.assertIn("content-type", {k.lower() for k in req.headers})

    def test_cookie_header_is_not_left_in_headers(self):
        req = parse_curl(CHROME_BASH_CURL)
        self.assertNotIn("cookie", {k.lower() for k in req.headers})

    def test_parses_windows_cmd_flavour(self):
        req = parse_curl(CHROME_CMD_CURL)
        self.assertEqual(req.url, "https://x.example.gov.in/s")
        self.assertEqual(req.cookies, {"a": "1", "b": "2"})
        self.assertEqual(req.body, "page=1&q=test")

    def test_get_when_there_is_no_body(self):
        req = parse_curl("curl 'https://site.gov.in/list?page=0' -H 'accept: */*'")
        self.assertEqual(req.method, "GET")
        self.assertIsNone(req.body)

    def test_body_param_replacement_preserves_order(self):
        req = parse_curl(CHROME_BASH_CURL)
        stepped = req.with_body_param("pageNo", "7")
        self.assertEqual(stepped, "state_code=26&pageNo=7&captcha=8f3k2")

    def test_body_param_added_when_absent(self):
        req = parse_curl(CHROME_BASH_CURL)
        self.assertIn("offset=40", req.with_body_param("offset", "40"))

    def test_rejects_non_curl_input(self):
        with self.assertRaises(ValueError):
            parse_curl("wget https://example.gov.in/file.pdf")

    def test_cookie_header_parsing(self):
        self.assertEqual(
            parse_cookie_header("a=1; b=two; c=3=4"),
            {"a": "1", "b": "two", "c": "3=4"},
        )


def _recipe(**overrides) -> Recipe:
    base = dict(
        name="t",
        start_urls=["https://court.example.gov.in/search"],
        container_selector="table.results tbody tr",
        link_selector="a[href]",
        fields={
            "case_number": FieldRule(selector="td:nth-child(1)"),
            "date": FieldRule(
                selector="td:nth-child(3)", regex=r"(\d{2}/\d{2}/\d{4})"
            ),
        },
    )
    base.update(overrides)
    return Recipe(**base)


class TestExtraction(unittest.TestCase):
    PAGE = "https://court.example.gov.in/search"

    def test_finds_pdfs_and_skips_non_pdfs(self):
        docs = find_documents(LISTING_HTML, self.PAGE, _recipe())
        urls = [d.url for d in docs]
        self.assertEqual(len(docs), 2)
        self.assertTrue(all(u.endswith(".pdf") for u in urls))

    def test_resolves_relative_urls(self):
        docs = find_documents(LISTING_HTML, self.PAGE, _recipe())
        self.assertEqual(
            docs[0].url, "https://court.example.gov.in/files/judgment_a.pdf"
        )

    def test_row_metadata_attaches_to_the_right_document(self):
        docs = find_documents(LISTING_HTML, self.PAGE, _recipe())
        self.assertEqual(docs[0].fields["case_number"], "WP(C) 1234/2023")
        self.assertEqual(docs[0].fields["date"], "14/03/2024")
        self.assertEqual(docs[1].fields["case_number"], "CRL.A. 99/2022")
        self.assertEqual(docs[1].fields["date"], "02/11/2023")

    def test_url_include_overrides_pdf_only(self):
        # Handler-style URLs with no .pdf extension are reachable via url_include.
        html = '<a href="/getDoc?id=42">Judgment</a>'
        recipe = _recipe(
            container_selector=None,
            url_include=r"/getDoc\?",
            pdf_only=True,
        )
        docs = find_documents(html, self.PAGE, recipe)
        self.assertEqual(len(docs), 1)
        self.assertTrue(docs[0].url.endswith("/getDoc?id=42"))

    def test_url_exclude_wins(self):
        recipe = _recipe(url_exclude=r"judgment_b")
        docs = find_documents(LISTING_HTML, self.PAGE, recipe)
        self.assertEqual(len(docs), 1)

    def test_javascript_and_anchor_links_ignored(self):
        html = '<a href="javascript:void(0)">x</a><a href="#top">y</a>'
        docs = find_documents(html, self.PAGE, _recipe(container_selector=None,
                                                       pdf_only=False))
        self.assertEqual(docs, [])

    def test_next_link(self):
        self.assertEqual(
            find_next_link(LISTING_HTML, self.PAGE, "a[rel=next]"),
            "https://court.example.gov.in/search?page=2",
        )

    def test_next_link_absent(self):
        self.assertIsNone(find_next_link("<html></html>", self.PAGE, "a[rel=next]"))

    def test_looks_like_pdf(self):
        self.assertTrue(looks_like_pdf("https://x.gov.in/a.pdf"))
        self.assertTrue(looks_like_pdf("https://x.gov.in/a.PDF?v=2"))
        self.assertFalse(looks_like_pdf("https://x.gov.in/a.html"))


class TestPagination(unittest.TestCase):
    def test_adds_param(self):
        self.assertEqual(
            query_page_url("https://x.gov.in/list", "page", 3),
            "https://x.gov.in/list?page=3",
        )

    def test_replaces_existing_param_and_keeps_others(self):
        out = query_page_url("https://x.gov.in/list?q=rape&page=1", "page", 4)
        self.assertIn("page=4", out)
        self.assertIn("q=rape", out)
        self.assertNotIn("page=1", out)


class TestRecipeValidation(unittest.TestCase):
    def test_needs_a_starting_point(self):
        with self.assertRaises(ValueError):
            Recipe(name="bad")

    def test_link_pagination_needs_selector(self):
        with self.assertRaises(ValueError):
            Recipe(
                name="bad",
                start_urls=["https://x.gov.in"],
                pagination=Pagination(mode="link"),
            )

    def test_form_pagination_needs_curl_file(self):
        with self.assertRaises(ValueError):
            Recipe(
                name="bad",
                start_urls=["https://x.gov.in"],
                pagination=Pagination(mode="form"),
            )

    def test_contact_appended_to_user_agent(self):
        recipe = Recipe(
            name="t", start_urls=["https://x.gov.in"], contact="me@example.com"
        )
        self.assertTrue(recipe.effective_user_agent().endswith("(+me@example.com)"))


class TestStoreHelpers(unittest.TestCase):
    def test_same_basename_different_urls_do_not_collide(self):
        a = _safe_name("https://x.gov.in/2023/judgment.pdf")
        b = _safe_name("https://x.gov.in/2024/judgment.pdf")
        self.assertNotEqual(a, b)
        self.assertTrue(a.endswith("_judgment.pdf"))

    def test_name_is_stable_for_the_same_url(self):
        url = "https://x.gov.in/a/b/order.pdf"
        self.assertEqual(_safe_name(url), _safe_name(url))

    def test_unsafe_characters_stripped(self):
        name = _safe_name("https://x.gov.in/WP%20(C)%201234%2F2023.pdf")
        self.assertNotIn(" ", name)
        self.assertNotIn("/", name.split("_", 1)[1])

    def test_extensionless_url_still_gets_a_name(self):
        self.assertTrue(_safe_name("https://x.gov.in/getDoc?id=9").endswith(".pdf"))

    def test_html_error_page_is_rejected(self):
        # A portal answering an expired session with a 200 and an HTML page at
        # a .pdf URL must not land in the corpus.
        for payload in (b"<!DOCTYPE html>", b"<html><body>", b"  <?xml version"):
            with self.assertRaises(DownloadRejected):
                _reject_if_not_a_document(payload, "https://x.gov.in/a.pdf", "text/html")

    def test_real_pdf_accepted(self):
        _reject_if_not_a_document(b"%PDF-1.7", "https://x.gov.in/a.pdf", "application/pdf")


class TestBlockDetection(unittest.TestCase):
    """The fetcher must recognise a challenge page instead of storing it."""

    def _guard(self, html, status=200, ctype="text/html"):
        from rag.scrapping.fetcher import Fetcher, SessionExpired

        class FakeResponse:
            status_code = status
            headers = {"Content-Type": ctype}
            text = html

        fetcher = Fetcher.__new__(Fetcher)  # no network, no session setup
        fetcher.recipe = _recipe()
        return fetcher, FakeResponse(), SessionExpired

    def test_recaptcha_page_detected(self):
        fetcher, resp, exc = self._guard(
            '<html><div class="g-recaptcha" data-sitekey="x"></div></html>'
        )
        with self.assertRaises(exc):
            fetcher._guard(resp, "https://x.gov.in/s")

    def test_cloudflare_challenge_detected(self):
        fetcher, resp, exc = self._guard("<html><title>Just a moment...</title></html>")
        with self.assertRaises(exc):
            fetcher._guard(resp, "https://x.gov.in/s")

    def test_403_detected(self):
        fetcher, resp, exc = self._guard("<html>nope</html>", status=403)
        with self.assertRaises(exc):
            fetcher._guard(resp, "https://x.gov.in/s")

    def test_legal_text_mentioning_captcha_is_not_a_false_positive(self):
        # A judgment that discusses CAPTCHAs must not be mistaken for a block.
        fetcher, resp, _ = self._guard(
            "<html><body>The petitioner argued that the captcha requirement "
            "under the impugned rules was arbitrary.</body></html>"
        )
        fetcher._guard(resp, "https://x.gov.in/s")  # must not raise

    def test_pdf_response_not_scanned_as_html(self):
        fetcher, resp, _ = self._guard(
            "g-recaptcha", ctype="application/pdf"
        )
        fetcher._guard(resp, "https://x.gov.in/a.pdf")  # must not raise

    def test_hint_message_is_actionable(self):
        fetcher, _, _ = self._guard("")
        hint = fetcher._refresh_hint("https://x.gov.in/s", "HTTP 403")
        self.assertIn("Copy as cURL", hint)
        self.assertIn("--resume", hint)


class TestRecipeLoading(unittest.TestCase):
    def test_bundled_recipes_all_parse(self):
        from rag.scrapping.recipe import list_recipes, load_recipe

        names = list_recipes()
        self.assertIn("delhi_hc_cause_lists", names)
        for name in names:
            try:
                recipe = load_recipe(name)
            except FileNotFoundError as exc:
                # ecourts_session points at a session file the user creates.
                self.assertIn("Copy as cURL", str(exc))
                continue
            self.assertTrue(recipe.allowed_hosts, f"{name} has no allowed_hosts")

    def test_allowed_hosts_derived_from_start_urls(self):
        from rag.scrapping.recipe import load_recipe

        recipe = load_recipe("delhi_hc_cause_lists")
        self.assertEqual(recipe.allowed_hosts, ["delhihighcourt.nic.in"])

    def test_unknown_recipe_lists_alternatives(self):
        from rag.scrapping.recipe import load_recipe

        with self.assertRaises(FileNotFoundError) as ctx:
            load_recipe("does_not_exist")
        self.assertIn("available:", str(ctx.exception))


class TestResume(unittest.TestCase):
    def test_manifest_is_replayed_on_restart(self):
        from rag.scrapping.models import ScrapedDoc
        from rag.scrapping.store import CrawlState

        with tempfile.TemporaryDirectory() as tmp:
            recipe = _recipe(out_dir=tmp)
            state = CrawlState(recipe, tmp)
            doc = ScrapedDoc(
                doc_id="abc",
                recipe="t",
                source_url="https://x.gov.in/a.pdf",
                filename="a.pdf",
                local_path=os.path.join(tmp, "a.pdf"),
                content_sha256="deadbeef",
                bytes=10,
            )
            state.record(doc)

            reopened = CrawlState(recipe, tmp)
            self.assertEqual(reopened.downloaded, 1)
            self.assertTrue(reopened.already_have("https://x.gov.in/a.pdf"))
            self.assertIn("deadbeef", reopened.seen_hashes)
            self.assertFalse(reopened.already_have("https://x.gov.in/b.pdf"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
