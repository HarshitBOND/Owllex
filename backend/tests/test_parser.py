"""
Ravenslaw Parser Accuracy Tests
==============================
Validates that the production parser produces the same accuracy baseline
as the original dhc_parser.py:
  - Core Perfect: >= 99.0%
  - Full Perfect: >= 80.0%
  - All case numbers valid: 100%

Run:
    cd ravenslaw_backend
    python -m pytest tests/ -v
    # or
    python tests/test_parser.py
"""

import os
import re
import sys
import unittest

# Ensure we can import from the app package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.parser import CASE_NO_REGEX, parse_pdf

# Locate test PDFs relative to the project root
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEST_DIR = os.path.join(PROJECT_ROOT, "test_pdfs")
SRC_DIR = os.path.join(PROJECT_ROOT, "src")

CM_LEAK = re.compile(r"^(?:CM\s+APPL|I\.A\.)[\s\d/]+", re.IGNORECASE)
GARBAGE = re.compile(r"^[\d\s\-/.,:;()*]+$|^\s*$|^V/?s\.?\s*$", re.IGNORECASE)


def _collect_pdfs():
    """Gather all test PDFs."""
    pdfs = []
    if os.path.isdir(SRC_DIR):
        for f in os.listdir(SRC_DIR):
            if f.endswith(".pdf"):
                pdfs.append(os.path.join(SRC_DIR, f))
    if os.path.isdir(TEST_DIR):
        for f in sorted(os.listdir(TEST_DIR)):
            if f.endswith(".pdf"):
                pdfs.append(os.path.join(TEST_DIR, f))
    return pdfs


def _analyze(cases):
    """Compute accuracy metrics for a list of cases."""
    N = len(cases)
    if N == 0:
        return {}

    valid_case = sum(1 for c in cases if c.main_case_no and CASE_NO_REGEX.search(c.main_case_no))
    good_pet = sum(1 for c in cases if c.petitioner and not GARBAGE.search(c.petitioner))
    good_res = sum(1 for c in cases if c.respondent and not GARBAGE.search(c.respondent))
    cm_leak = sum(1 for c in cases if c.petitioner and CM_LEAK.match(c.petitioner))

    perfect_core = sum(1 for c in cases if all([
        c.petitioner, c.respondent, c.judge, c.court_no, c.section,
        c.item_no, c.advocate_petitioner,
        not (c.petitioner and CM_LEAK.match(c.petitioner))
    ]))

    full_perfect = sum(1 for c in cases if all([
        c.petitioner, c.respondent, c.judge, c.court_no, c.section,
        c.item_no, c.advocate_petitioner, c.advocate_respondent,
        not (c.petitioner and CM_LEAK.match(c.petitioner))
    ]))

    return {
        "total": N,
        "valid_case": valid_case,
        "good_pet": good_pet,
        "good_res": good_res,
        "cm_leak": cm_leak,
        "perfect_core": perfect_core,
        "full_perfect": full_perfect,
    }


class TestParserAccuracy(unittest.TestCase):
    """Test that the parser maintains accuracy baselines."""

    @classmethod
    def setUpClass(cls):
        cls.pdfs = _collect_pdfs()
        cls.all_cases = []
        cls.per_pdf = {}

        for pdf_path in cls.pdfs:
            try:
                cases = parse_pdf(pdf_path)
                cls.all_cases.extend(cases)
                cls.per_pdf[os.path.basename(pdf_path)] = cases
            except Exception as e:
                print(f"ERROR parsing {pdf_path}: {e}")

    def test_pdfs_found(self):
        """At least one test PDF must exist."""
        self.assertGreater(len(self.pdfs), 0, "No test PDFs found")

    def test_cases_extracted(self):
        """Parser must extract cases."""
        self.assertGreater(len(self.all_cases), 0, "No cases extracted from any PDF")

    def test_valid_case_numbers_100pct(self):
        """All case numbers must match the DHC case pattern."""
        m = _analyze(self.all_cases)
        self.assertEqual(m["valid_case"], m["total"],
                         f"Invalid case numbers: {m['total'] - m['valid_case']}/{m['total']}")

    def test_core_perfect_above_99pct(self):
        """Core accuracy (all fields except adv_respondent) must be >= 99%."""
        m = _analyze(self.all_cases)
        pct = m["perfect_core"] / m["total"] * 100
        self.assertGreaterEqual(pct, 99.0,
                                f"Core Perfect: {pct:.1f}% ({m['perfect_core']}/{m['total']})")

    def test_full_perfect_above_80pct(self):
        """Full accuracy (all fields including adv_respondent) must be >= 80%."""
        m = _analyze(self.all_cases)
        pct = m["full_perfect"] / m["total"] * 100
        self.assertGreaterEqual(pct, 80.0,
                                f"Full Perfect: {pct:.1f}% ({m['full_perfect']}/{m['total']})")

    def test_no_cm_leak(self):
        """CM APPL / I.A. numbers must not leak into petitioner field."""
        m = _analyze(self.all_cases)
        self.assertEqual(m["cm_leak"], 0,
                         f"CM leak in petitioner: {m['cm_leak']} cases")

    def test_petitioner_fill_above_99pct(self):
        """Petitioner field must be filled in >= 99% of cases."""
        m = _analyze(self.all_cases)
        pct = m["good_pet"] / m["total"] * 100
        self.assertGreaterEqual(pct, 99.0,
                                f"Petitioner fill: {pct:.1f}%")

    def test_respondent_fill_above_99pct(self):
        """Respondent field must be filled in >= 99% of cases."""
        m = _analyze(self.all_cases)
        pct = m["good_res"] / m["total"] * 100
        self.assertGreaterEqual(pct, 99.0,
                                f"Respondent fill: {pct:.1f}%")


class TestParserFunctionality(unittest.TestCase):
    """Test parser functions work correctly."""

    def test_parse_pdf_file_not_found(self):
        """parse_pdf must raise FileNotFoundError for missing files."""
        with self.assertRaises(FileNotFoundError):
            parse_pdf("nonexistent_file.pdf")

    def test_split_parties(self):
        """Party splitting must correctly separate petitioner and respondent."""
        from app.parser import split_parties

        pet, res = split_parties("DR SATENDRA SINGH V/s UNION OF INDIA")
        self.assertEqual(pet, "DR SATENDRA SINGH")
        self.assertEqual(res, "UNION OF INDIA")

    def test_split_parties_no_vs(self):
        """Without V/s, entire string should be petitioner."""
        from app.parser import split_parties

        pet, res = split_parties("DR SATENDRA SINGH")
        self.assertEqual(pet, "DR SATENDRA SINGH")
        self.assertEqual(res, "")


if __name__ == "__main__":
    # Print summary before running tests
    pdfs = _collect_pdfs()
    print(f"\nFound {len(pdfs)} test PDFs")

    all_cases = []
    for pdf_path in pdfs:
        try:
            cases = parse_pdf(pdf_path)
            all_cases.extend(cases)
            print(f"  {os.path.basename(pdf_path)}: {len(cases)} cases")
        except Exception as e:
            print(f"  {os.path.basename(pdf_path)}: ERROR - {e}")

    if all_cases:
        m = _analyze(all_cases)
        print(f"\nTotal: {m['total']} cases")
        print(f"Core Perfect: {m['perfect_core']}/{m['total']} ({m['perfect_core']/m['total']*100:.1f}%)")
        print(f"Full Perfect: {m['full_perfect']}/{m['total']} ({m['full_perfect']/m['total']*100:.1f}%)")

    print("\n" + "=" * 60)
    unittest.main(verbosity=2)
