"""
LexVert - Delhi High Court Cause List Parser Engine
====================================================
Handles ALL Delhi HC cause list formats:
  - Combined Cause List      (combined_adv_DD.MM.YYYY.pdf)
  - Advance Cause List       (adv_DD.MM.YYYY.pdf)
  - Supplementary Cause List (new_c_DDMMYYYY.pdf / supp_*)
  - Daily Cause List         (c_DDMMYYYY.pdf)

IMPORTANT: This module contains the exact parsing logic that has been
tested and validated against 11,854 cases across 11 real DHC PDFs.
Do NOT modify regex patterns or parsing logic without re-running the
full test suite to verify accuracy is preserved.

Current accuracy baseline:
  - Core Perfect: 99.3% (11774/11854)
  - Full Perfect: 80.8% (9575/11854)
"""

import logging
import re
from typing import List, Optional, Tuple

import pdfplumber

from .models import CaseEntry

logger = logging.getLogger("lexvert.parser")


# ═════════════════════════════════════════════════════════════════════════════
# ALL DELHI HC CASE NUMBER PATTERNS
# ═════════════════════════════════════════════════════════════════════════════

DHC_CASE_TYPES = r"""
    (?:
        W\.P\.\(CRL\)
      | W\.P\.\(C\)
      | CRL\.M\.\(BAIL\)
      | CRL\.M\.C\.?
      | CRL\.A\.
      | CRL\.L\.P\.
      | CRL\.REV\.P\.
      | CRL\.M\.A\.
      | CM\s+APPL?\.?
      | CM\(M\)
      | FAO\(OS\)\s*\(COMM\)
      | FAO\(OS\)
      | FAO\s*\(COMM\)
      | FAO
      | LPA
      | RFA\(OS\)\s*\(COMM\)
      | RFA\(OS\)
      | RFA\s*\(COMM\)
      | RFA
      | RSA
      | CS\(OS\)\s*\(COMM\)
      | CS\(OS\)
      | CS\s*\(COMM\)
      | OMP\(I\)\s*\(COMM\)
      | OMP\s*\(COMM\)
      | OMP\(ENF\)\s*\(COMM\)
      | OMP\(T\)\s*\(COMM\)
      | OMP
      | ARB\.P\.
      | EX\.P\.
      | EX\.APPL?\.\(OS\)
      | CONT\.CAS\(C\)
      | CONT\.CAS\(CRL\)
      | CONT\.CAS
      | I\.A\.
      | MAC\.APP\.
      | CUST\.APP\.
      | CUSAA
      | CO\.APPL?\.?
      | LA\.APP\.
      | RC\.REV\.
      | ITA
      | TR\.P\.\(CRL\)
      | TR\.P\.\(C\)
      | SLP
      | BAIL\s+APPLN?\.?
      | DEATH\s+REF\.
      | MAT\.APP\.\(F\.C\.\)
      | MAT\.APP\.
      | HCP
      | GUA\.P\.
      | TEST\.CAS\.
      | PROB\.
      | ECIR
      | CAV
      | C\.A\.\(COMM\.IPD[^)]*\)
      | C\.A\.\([^)]+\)
      | REV\.PET\.
      | REVIEW\s+PET\.
      | S\.A\.
      | MANU\.APP\.
      | CRL\.APPL?\.
    )
"""

CASE_NO_REGEX = re.compile(
    rf"""
    (?P<case>
        {DHC_CASE_TYPES}
        [\s\-]*
        \d{{1,6}}
        \.?\s*/\s*\d{{4}}
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

CM_APPL_REGEX = re.compile(
    r"""
    (?P<cm>
        CM\s+APPL?\.?\s*[\d\-,\s]+/\s*\d{4}
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

ITEM_LINE_REGEX = re.compile(r"^\s*(\d{1,3})\.?\s+")

DATE_REGEX = re.compile(r"\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b")

VS_REGEX = re.compile(r"\bV/?\s*[Ss]\.?\b|\bversus\b", re.IGNORECASE)

EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

PHONE_REGEX = re.compile(r"\b\d{10}\b|\(\d{10}\)")

SECTION_HEADERS = re.compile(
    r"""
    ^\s*(?:
        FOR\s+(?:ADMISSION|ORDERS?|HEARING|DIRECTIONS?|EVIDENCE|COMPLIANCE
              |ARGUMENTS?|DISPOSAL|PRONOUNCEMENT|VALUATION|CLARIFICATION
              |CONSIDERATION|QUANTUM\s+OF\s+SENTENCE
              |DIRECTION(?:\s+ON\s+OFFICE\s+NOTE)?
              |FINAL\s+(?:HEARING|DISPOSAL|ARGUMENTS?))
              (?:\s*\([A-Z/\s]+\))?
      | AFTER\s+NOTICE(?:\s+(?:MISC\.?\s*|COMPANY\s+)?MATTERS)?
      | MISC\.?\s+MATTERS
      | SUPPLEMENTARY\s+LIST
      | SPECIALLY\s+FIXED
      | PART[\-\s]HEARD(?:\s+MATTERS)?
      | REGULAR\s+MATTERS(?:\s*(?:&|AND)\s*[\w\s]+)?(?:\s+(?:DATE[DS]?\s+FIXED|WEEK\s+COMMENCING)(?:\s+(?:FOR\s+)?\S+)?)?\s*
      | FRESH\s+MATTERS(?:\s*(?:&|AND)\s*[\w\s]+)?
      | CASES\s+INVOLVING\s+DIFFERENTLY[\-\s]ABLED(?:\s+PERSONS)?
      | URGENT\s+MATTERS
      | LISTED\s+MATTERS
      | APPLICATIONS
      | BAIL(?:\s+MATTERS)?
      | ANTICIPATORY\s+BAIL
      | INTERIM\s+BAIL
      | HABEAS\s+CORPUS
      | CONTEMPT\s+MATTERS
      | INTERLOCUTORY\s+APPLICATIONS
      | ADMISSION\s+DENIAL
      | TOP\s+OF\s+THE\s+BOARD
      | END\s+OF\s+THE\s+BOARD(?:[\s/]+(?:FOR\s+DISPOSAL\s+)?MATTERS)?
      | (?:OLD[/\s]*)?TARGETED\s+(?:MATTERS|CASES)
      | CONNECTED\s+MATTERS(?:\s*\(.*?\))?
      | SUSPENSION\s+OF\s+SENTENCE
      | FINAL\s+ARGUMENTS?
      | (?:SETTLEMENT\s+)?(?:FRAMING\s+)?OF\s+ISSUES(?:\s*\(.*?\))?
      | PATENTS?\s+AND\s+DESIGNS?
      | DESIGNS?
      | CRL\.M\.C\.?\s*\(CANCELL?ATION[^)]*\)
      | PAROLE[/\s]*FURLOUGH
      | SHORT\s+MATTERS(?:\s*\(.*?\)|[\w\s/\-]*)
      | CASES\s+LISTED\s+BEFORE\s+REGISTRARS?
      | FOR\s+PRONOUNCEMENT(?:\s+OF\s+JUDGMENTS?)?
      | FIRST\s+\d+\s+MATTERS?
      | TOP\s+OF\s+\d+\s+MATTERS?
      | COMPANY\s+MATTERS
      | DEFAULT\s+MATTERS
      | (?:\d+\s+YEARS?\s+)?OLD\s+(?:\(\d+\s+YEARS?\)\s+)?(?:TARGETED\s+)?(?:MATTERS|CASES)
      | (?:FIRST|TOP(?:\s+OF)?)\s+\d+\s+MATTERS?
      | CASES\s+INVOLVING[\w\s\-]+
      | \(?FIRST\s+(?:FIVE|TEN|\d+)\s+MATTERS?\)?
      | ORDERS?[/\s]*CLARIFICATION
      | MATTERS\s+OF\s+SITTING[/\s]+FORMER\s+MP[/\s]*MLA[\w\s()]*
      | (?:PRIORITY|CRIMINAL|CIVIL)\s+MATTERS[\w\s()]*
      | NON[\-\s]?CONTENTIOUS\s+CASES(?:\s*\(.*?\))?
      | UNAUTHORISED\s+CONSTRUCTION[\w\s/]*MATTERS
      | (?:ADMIN|ADMINISTRATIVE)\s+REPORT[\w\s]*
      | HEARING\s+(?:OF\s+)?CASES[\w\s/]*
      | ADMISSION[/\s]+HEARING
      | DIRECTIONS?[/\s]+ORDERS?
      | PW[/\s]*DW\s+EVIDENCE
    )(?:\s*/\s*AT\s+\d{1,2}[.:]\d{2}\s*(?:AM|PM)?)?[\s\-:*/]*$
    """,
    re.VERBOSE | re.IGNORECASE,
)

NOISE_REGEX = re.compile(
    r"""
    ^\s*(?:
        ITEM(?:\s+(?:NO\.?|NUMBER))?\s*$
      | CASE\s+NUMBER
      | PARTY\s+NAME
      | ADVOCATE\s+NAME
      | OTHER\s+INFORMATION
      | NUMBER\s*$
      | PAGE\s+\d+
      | \d+\s*$
      | NOTE\s*\d*\s*:
      | CLICK\s+HERE
      | https?://
      | MEETING\s+(?:NO|ID|NUMBER)\.?
      | FOR\s+MOVING\s+ADJOURNMENT
      | COURTMASTER
      | COURT\s+MASTER
      | OTHER\s+DETAILS\s+OF\s+ADVOCATES
      | [A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}
      | \(\d{10}\)
      | \b\d{10}\b
      | \d{1,2}[./-]\d{1,2}[./-]\d{4}\s*(?:(?:ADVANCE|COMBINED|SUPPLEMENTARY|DAILY)?\s*CAUSE\s+LIST[^\n]*)?
      | (?:CRIMINAL|CIVIL)\s+(?:SIDE\s+)?(?:MATTERS|APPEALS)\s*$
      | JOIN\s+(?:FROM|BY)\s+
      | ACCESS\s+CODE
      | DIAL\s*:
      | CL[I]K\s+HERE
      | YOU\s+CAN\s+ALSO\s+DIAL
      | JOIN\s+BY\s+PHONE
      | (?:COUNSELS?|PARTIES)\s+(?:AND\s+)?(?:LITIGANTS?)?\s*(?:MAY|ARE)\s+
      | THEMSELVES\s+ONLY\s+WHEN
      | WHILE\s+APPEARING\s+THROUGH
      | DISTURBANCE\.?\s*$
      | HEARING\s+MATTERS\.?\s*$
      | PER\s+RULES\.?\s*$
      | AS\s*$
      | TO\s+JOIN\s+V\.?C\.?\s*:
      | FOR\s+SENDING\s+APPEARANCE
      | FOR\s+ADJOURNMENT\s+SLIP
      | CONFERENCES\/FRAMING\s*$
      | \*{3,}\s*$
      | PRACTICE\s+DIRECTIONS?
      | THE\s+SUBMISSIONS\s+SHALL
      | PARTIES\s+(?:WOULD|ARE)\s+(?:SUBMIT|REQUIRED)
      | A\.\s+FACTS\s*$
      | B\.\s+SUBMISSIONS\s*$
      | \d+\.\s+(?:PARTIES|THOSE|THAT|WRITTEN|THE)\s+
      | WHEREVER\s+SO\s+REQUIRED
      | ARGUED\s+AND\s+RESERVED
      | CONCERNED\.?\s+IN\s+CASE
      | MENTIONED\s+BEFORE
      | PENDING\s+BEFORE
      | IN\s+THE\s+CHAT\s+BOX
      | AWARD\s+DAIRY\s+NO
      | \(Disposed\s+off
      | NOT\s+BEFORE\s+\d
      | CASE\s*\)\s*$
      | [-_]{5,}
      | FIRST\s+(?:FIVE|TEN|\d+)\s+(?:MATTERS?|FATTERS?)
      | TOP\s+OF\s+\d+\s+(?:MATTERS?|FATTERS?)
      | FIRST\s+\d+\s+(?:MATTER|FATTER)\b
      | (?:MEETING|ACCESS)\s+(?:LINK|NO|NUMBER|CODE)\s*[:\-]?
      | \d{4}\s+\d{2,3}\s+\d{4,}
      | NOTIFICATION\s+FOR\s+INFORMATION
      | HAVE\s+BEEN\s+DECLARED\s+AS\s+HOLIDAYS
      | MEDIATION
      | REGISTRAR\s+GENERAL
      | for\s+Registrar\s+General
      | Registrar\s+\(IT\)
      | \d{1,2}[./-]\d{1,2}[./-]\d{4}\s+R-\d+
      | NOTICE\s*$
      | TEN\s+REGULAR\s+MATTERS
      | THE\s+YEAR\s+\d{4}
      | SHALL\s+BE\s+LISTED\s+BEFORE
      | SERVICE\s+OF\s+NOTICE
      | NO\s+MATTER\s+PREVIOUSLY\s+LISTED
      | W\.E\.F\b
      | ADVANCE\s+LIST\s+WILL\s+BE
      | SUPPLEMENTARY\s+LIST\s+WILL\s+BE
      | PASSOVERS?\s+WILL\s+BE
      | ON\s+THE\s+DAY\s+WHEN
      | MATTERS\s+WILL\s+BE\s+TAKEN
      | ADVOCATES.*REQUIRED.*PERSONS
      | THROUGH\s+VC\s+SHALL
      | KEEP\s+THEIR\s+MICROPHONES
      | AT\s+THE\s+TIME\s+OF\s+MENTIONING
      | THE\s+COURT\s+WILL\s+BE\s+TAKEN
      | PRONOUNCEMENT\s+OF\s+JUDGMENT
      | \bNOTE\b\s*\d*\s*$
      | THEIR\s+MOBILE\s+NUMBERS
      | REGULAR\s+MATTERS\s+DATE\s+FIXED(?:\s+FOR\s+\S+)?
      | REGULAR\s+MATTERS?\s+LISTED\s+BEFORE
      | LISTED\s+BEFORE\s+HON
      | [-]{3,}D/o\.?
      | OFFICER\s*$
      | CASES[\"\u201d]?\.\s*$
      | COMPLETION\s+OF\s*$
      | LEARNED\s+JOINT\s*$
      | PERTAINING\s+TO\s*$
      | THE\s+NODAL\s*$
      | (?:PROVIDING|BY\s+PROVIDING)\s+THE\s+DETA
      | CONVEY\s+THEIR\s+WILLINGNESS
      | SPECIAL\s+MEDIATION\s+DRIVE
      | CONCEPTUALIZED
      | IDENTIFICATION\s+AND\s+REFERRAL
      | TO\s+BE\s+CONTINUED\s+UP\s+TILL
      | SETTLE\s+THEIR\s*$
      | SETTLE\s+PENDING\s+CASES
      | INDIA\s+HAS\s+CONCEPTUALIZED
      | DISTRICT\s+COURTS\s+AND\s+HIGH\s+COURTS
      | CONCILIATION\s+PROJECT
      | BOTH/?\s*ALL\s+THE\s+PARTIES
      | (?:CLICK\s+HERE\s+FOR\s+)?ATTACHMENT\s*$
      | FOR\s+OFFICE\s+USE\s+ONLY
      | INFORMATION\s+OF\s+ALL\s+CONCERNED
      | DECLARED\s+AS\s+HOLIDAYS
      | (?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)[,\s]+(?:THE\s+)?\d
      | (?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)
      | [-_]{10,}\s*$
      | NOT\s+BEFORE\s+\d
      | ANY\s+ADJOURNMENT\s+(?:SLIP|SOUGHT)
      | NO\s+ADJOURMENT?\s+SHALL
      | NON\s+AVAILABL
      | CIRCULATING\s+THE\s+ADJOURNMENT
      | WITHOUT\s+CIRCULATING\s+THE
      | ADJOURNMENT\s+SLIP\s+IN\s+THE
      | IS\s+CIRCULATED\s+FOR\s+INFORMATION
      | IT\s+IS\s+CIRCULATED
      | NO\s+OBJECTION
      | REQUESTING\s+ADJOURNMENT
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

ADVOCATE_DETAIL_REGEX = re.compile(
    r"\((PETITIONER|RESPONDENT|APPLICANT|APPELLANT|PLAINTIFF|DEFENDANT|INTERVENOR)\)",
    re.IGNORECASE,
)


# ═════════════════════════════════════════════════════════════════════════════
# PDF TEXT EXTRACTION  (column-aware)
# ═════════════════════════════════════════════════════════════════════════════

def _group_words_into_lines(words, y_tol=4):
    """Cluster words into visual lines by y-proximity."""
    if not words:
        return []
    sw = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines = []
    cur = [sw[0]]
    for w in sw[1:]:
        avg_y = sum(ww["top"] for ww in cur) / len(cur)
        if abs(w["top"] - avg_y) <= y_tol:
            cur.append(w)
        else:
            lines.append(sorted(cur, key=lambda ww: ww["x0"]))
            cur = [w]
    if cur:
        lines.append(sorted(cur, key=lambda ww: ww["x0"]))
    return lines


def _normalize_char(text: str) -> str:
    """Replace smart-quotes / dashes with ASCII equivalents."""
    return (text
            .replace('\u2018', "'").replace('\u2019', "'")
            .replace('\u201c', '"').replace('\u201d', '"')
            .replace('\u201f', '"')
            .replace('\u2013', '-').replace('\u2014', '-')
            .replace('\u201e', '"')
            .replace('\u2033', '"')
            .replace('\u2032', "'"))


def extract_lines(pdf_path: str) -> Tuple[List[str], List[str]]:
    """Column-aware text extraction from a DHC cause list PDF.

    Uses word-level positions to separate THREE zones:
      - PARTY zone     (x < adv_x)      – case numbers + party names
      - ADVOCATE zone  (adv_x <= x < other_x) – advocate names
      - OTHER INFO zone (x >= other_x)   – cross-refs / disposed cases -> DROPPED

    Returns
    -------
    lines     : list[str] – clean text (party column)
    adv_texts : list[str] – advocate-column text per line (parallel array)

    Raises
    ------
    FileNotFoundError : if pdf_path does not exist
    Exception         : on PDF parsing failure
    """
    ADV_X_DEFAULT   = 425
    OTHER_X_DEFAULT = 585
    CASE_X_MIN      = 80
    CASE_X_MAX      = 225

    _email_quick = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
    _role_tag    = re.compile(r'\((?:PETITIONER|RESPONDENT|APPLICANT|APPELLANT|PLAINTIFF|DEFENDANT|INTERVENOR)\)', re.IGNORECASE)

    all_lines: List[str] = []
    all_advs:  List[str] = []

    persistent_adv_x   = ADV_X_DEFAULT
    persistent_other_x = OTHER_X_DEFAULT

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            try:
                words = page.extract_words(x_tolerance=3, y_tolerance=3)
            except Exception:
                logger.warning("Failed to extract words from page %d of %s", page_num, pdf_path)
                continue
            if not words:
                continue

            try:
                vlines = _group_words_into_lines(words)
            except Exception:
                logger.warning("Failed to group words on page %d of %s", page_num, pdf_path)
                continue

            found_header = False
            adv_x   = persistent_adv_x
            other_x = persistent_other_x
            for vl in vlines:
                joined = " ".join(w["text"] for w in vl).upper()
                if "ADVOCATE" in joined and ("PARTY" in joined or "CASE" in joined):
                    for w in vl:
                        t = w["text"].upper()
                        if t == "ADVOCATE":
                            adv_x = w["x0"] - 10
                        if t == "OTHER":
                            other_x = w["x0"] - 10
                    found_header = True
                    break

            if found_header:
                persistent_adv_x = adv_x
                persistent_other_x = other_x

            for vl in vlines:
                pw = [w for w in vl if w["x0"] < adv_x]
                aw = [w for w in vl if adv_x <= w["x0"] < other_x]
                ow = [w for w in vl if w["x0"] >= other_x]

                if not pw and not aw and ow:
                    continue

                is_tabular = any(
                    CASE_X_MIN <= w["x0"] <= CASE_X_MAX
                    and any(ch.isdigit() for ch in w["text"])
                    for w in vl
                )

                if is_tabular:
                    party_t = " ".join(_normalize_char(w["text"]) for w in pw).strip()
                    adv_t = " ".join(_normalize_char(w["text"]) for w in aw).strip()
                else:
                    full_text = " ".join(_normalize_char(w["text"]) for w in vl).strip()
                    has_email = bool(_email_quick.search(full_text))
                    has_role  = bool(_role_tag.search(full_text))

                    if pw and aw and not has_email and not has_role:
                        party_t = " ".join(_normalize_char(w["text"]) for w in pw).strip()
                        adv_t = " ".join(_normalize_char(w["text"]) for w in (aw + ow)).strip()
                    else:
                        party_t = " ".join(_normalize_char(w["text"]) for w in (pw + aw)).strip()
                        adv_t = " ".join(_normalize_char(w["text"]) for w in ow).strip()

                if party_t:
                    all_lines.append(party_t)
                    all_advs.append(adv_t)
                elif adv_t:
                    all_lines.append(adv_t)
                    all_advs.append("")

    logger.info("Extracted %d lines from %s", len(all_lines), pdf_path)
    return all_lines, all_advs


# ═════════════════════════════════════════════════════════════════════════════
# HEADER PARSING
# ═════════════════════════════════════════════════════════════════════════════

def parse_header(lines: List[str], adv_texts: List[str] = None) -> dict:
    """Scan the first 40 lines to extract document-level metadata."""
    meta = {
        "list_type": None,
        "list_date": None,
        "court_no": None,
        "bench": None,
        "judge": None,
    }
    judge_parts = []
    _adv = adv_texts or [""] * len(lines)

    for idx, line in enumerate(lines[:40]):
        full = line + " " + (_adv[idx] if idx < len(_adv) else "")
        upper = full.upper()

        if "ADVANCE CAUSE LIST" in upper and not meta["list_type"]:
            meta["list_type"] = "ADVANCE CAUSE LIST"
        elif "SUPPLEMENTARY CAUSE LIST" in upper and not meta["list_type"]:
            meta["list_type"] = "SUPPLEMENTARY CAUSE LIST"
        elif "COMBINED CAUSE LIST" in upper and not meta["list_type"]:
            meta["list_type"] = "COMBINED CAUSE LIST"
        elif "PRONOUNCEMENT" in upper and not meta["list_type"]:
            meta["list_type"] = "PRONOUNCEMENT LIST"
        elif "REGULAR MATTER" in upper and not meta["list_type"]:
            meta["list_type"] = "REGULAR CAUSE LIST"
        elif "CAUSE LIST" in upper and not meta["list_type"]:
            meta["list_type"] = "DAILY CAUSE LIST"

        dm = DATE_REGEX.search(full)
        if dm and not meta["list_date"]:
            meta["list_date"] = dm.group(1)

        cm = re.search(r"COURT\s+NO\.?\s*(\d+)", line, re.IGNORECASE)
        if cm and not meta["court_no"]:
            meta["court_no"] = cm.group(1)

        bm = re.search(r"((?:DIVISION|SINGLE|FULL)\s+BENCH[\w\s\-]*)", line, re.IGNORECASE)
        if bm and not meta["bench"]:
            meta["bench"] = bm.group(1).strip()

        if re.match(r"^\s*(?:HON[^\w\s]{0,3}BLE|CORAM\b|BEFORE\s+(?:HON|DR|MR|MS|SH)\.?)", line, re.IGNORECASE):
            judge_parts.append(line.strip())

    if judge_parts:
        meta["judge"] = "; ".join(judge_parts)

    return meta


# ═════════════════════════════════════════════════════════════════════════════
# PARTY SPLITTER
# ═════════════════════════════════════════════════════════════════════════════

def split_parties(raw: str) -> Tuple[str, str]:
    """Split 'PET V/s RES' into (petitioner, respondent).
    Strips advocate name leaked after respondent.
    """
    vs = VS_REGEX.search(raw)
    if vs:
        petitioner = raw[:vs.start()].strip()
        respondent = raw[vs.end():].strip().lstrip('.')
        res_parts = re.split(r"\s{2,}|\t", respondent)
        respondent = res_parts[0].strip()

        _party_end = re.search(
            r'(&\s+(?:ORS|ANR|OTHERS?)\.?)\s+(?=[A-Z][A-Z\s,.]+$)',
            respondent, re.IGNORECASE
        )
        if _party_end:
            _leftover = respondent[_party_end.end():].strip()
            if _leftover and '&' not in _leftover and not re.search(r'\bOF\b|\bTHE\b|\bGOVT\b|\bUNION\b', _leftover, re.IGNORECASE):
                respondent = respondent[:_party_end.end()].strip()
    else:
        petitioner = raw.strip()
        respondent = ""
    return petitioner, respondent


# ═════════════════════════════════════════════════════════════════════════════
# ADVOCATE NAME CLEANER
# ═════════════════════════════════════════════════════════════════════════════

def _clean_advocate_name(name: str) -> str:
    """Strip emails, phone numbers, orphan parens from an advocate name."""
    name = EMAIL_REGEX.sub("", name)
    name = PHONE_REGEX.sub("", name)
    name = re.sub(r"[()]+", "", name)
    name = name.strip(",.;: ")
    return name


# ═════════════════════════════════════════════════════════════════════════════
# MAIN PARSER
# ═════════════════════════════════════════════════════════════════════════════

def parse_cases(lines: List[str], source_pdf: str,
                adv_texts: List[str] = None) -> List[CaseEntry]:
    """Parse extracted lines into structured CaseEntry objects.

    Parameters
    ----------
    lines      : Text lines from extract_lines()
    source_pdf : Original PDF filename (for metadata)
    adv_texts  : Parallel advocate column text from extract_lines()

    Returns
    -------
    List[CaseEntry] — parsed cases with all available fields populated
    """
    cases = []
    _adv = adv_texts or [""] * len(lines)
    doc_meta = parse_header(lines, adv_texts)

    # Fallback: infer list_type from filename
    if not doc_meta["list_type"] and source_pdf:
        _fn = source_pdf.upper()
        if "PRONOUNCEMENT" in _fn:
            doc_meta["list_type"] = "PRONOUNCEMENT LIST"
        elif "REGULAR" in _fn:
            doc_meta["list_type"] = "REGULAR CAUSE LIST"
        elif "SUPP" in _fn:
            doc_meta["list_type"] = "SUPPLEMENTARY CAUSE LIST"
        elif "ADV" in _fn:
            doc_meta["list_type"] = "ADVANCE CAUSE LIST"
        elif "COMBINED" in _fn:
            doc_meta["list_type"] = "COMBINED CAUSE LIST"
        else:
            doc_meta["list_type"] = "CAUSE LIST"

    current_court_no = doc_meta["court_no"]
    current_bench    = doc_meta["bench"]
    current_judge    = doc_meta["judge"]

    current_section = None
    current_item_no = None
    active_main_case = None
    active_section = None
    active_linked = []
    active_parties_raw = []
    active_adv_petitioner = None
    active_adv_respondent = None
    active_table_adv_pet  = None
    active_table_adv_resp = None
    _table_adv_pet_parts = []
    _table_adv_res_parts = []
    _seen_vs_line = False

    _OTHER_INFO_LEAK = re.compile(
        r'REGULAR MATTER|P\.S\.-|OTHER CASE|DISPOSED|FILED BY|FIR NO|BAIL APPLN',
        re.IGNORECASE,
    )

    in_adv_block = False
    adv_accumulator = []
    _last_petitioner = None
    _last_respondent = None

    def flush():
        nonlocal active_main_case, active_section, active_linked, active_parties_raw
        nonlocal active_adv_petitioner, active_adv_respondent, in_adv_block
        nonlocal active_table_adv_pet, active_table_adv_resp
        nonlocal current_item_no, _table_adv_pet_parts, _table_adv_res_parts, _seen_vs_line
        nonlocal _last_petitioner, _last_respondent

        if not active_main_case:
            return

        raw = " ".join(active_parties_raw)

        raw_clean = re.sub(
            r"^\s*(?:CM\s+APPL?\.?|I\.A\.)\s*[\d/,\s]+\s*",
            "", raw, flags=re.IGNORECASE
        ).strip()

        _disposed_re = re.compile(r"\(?Disposed\s+off(?:\s+case)?\)?", re.IGNORECASE)
        if _disposed_re.search(raw_clean):
            _trial = _disposed_re.sub("", raw_clean).strip()
            if _trial:
                raw_clean = _trial
            else:
                active_main_case = None
                active_linked = []
                active_parties_raw = []
                active_adv_petitioner = None
                active_adv_respondent = None
                active_table_adv_pet = None
                active_table_adv_resp = None
                _table_adv_pet_parts = []
                _table_adv_res_parts = []
                _seen_vs_line = False
                in_adv_block = False
                adv_accumulator.clear()
                current_item_no = None
                return

        raw_clean = re.sub(r"\*{3,}", "", raw_clean).strip()
        raw_clean = re.sub(r"FIRST\s+(?:FIVE|TEN|\d+)\s+(?:MATTERS?|FATTERS?)\b", "", raw_clean, flags=re.IGNORECASE).strip()
        raw_clean = re.sub(r"\(?TOP\s+OF\s+\d+\s+(?:MATTERS?|FATTERS?)\)?\b", "", raw_clean, flags=re.IGNORECASE).strip()
        raw_clean = re.sub(r"REGULAR\s+MATTERS?\s+DATE\s+FIXED(?:\s+FOR\s+\S+)?", "", raw_clean, flags=re.IGNORECASE).strip()
        raw_clean = re.sub(r"[-]{3,}D/o\.?\s*", "", raw_clean).strip()
        raw_clean = re.sub(r"THROUGH\s+LEGAL\s+HEIR\b", "", raw_clean, flags=re.IGNORECASE).strip()
        raw_clean = re.sub(r"[-]{3,}\s*NOT\s+BEFORE[^,]*", "", raw_clean, flags=re.IGNORECASE).strip()
        raw_clean = re.sub(r'^[\-_\s"]+$', '', raw_clean).strip()

        if not raw_clean:
            active_main_case = None
            active_linked = []
            active_parties_raw = []
            active_adv_petitioner = None
            active_adv_respondent = None
            active_table_adv_pet = None
            active_table_adv_resp = None
            _table_adv_pet_parts = []
            _table_adv_res_parts = []
            _seen_vs_line = False
            in_adv_block = False
            adv_accumulator.clear()
            current_item_no = None
            return

        pet, res = split_parties(raw_clean)

        if not pet and res and _last_petitioner:
            pet = _last_petitioner
        if not res and pet and _last_respondent:
            if re.match(r"(?:I\.A\.|CM\s+APPL|CONT\.?CAS|CRL\.M\.A)", active_main_case or "", re.IGNORECASE):
                res = _last_respondent
        if pet:
            _last_petitioner = pet
        if res:
            _last_respondent = res

        bench = current_bench
        if not bench and current_judge:
            hon_count = len(re.findall(r"HON[^\w\s]{0,3}BLE", current_judge, re.IGNORECASE))
            bench = "DIVISION BENCH" if hon_count >= 2 else "SINGLE BENCH"

        _tbl_pet = ", ".join(_table_adv_pet_parts).strip(", ") if _table_adv_pet_parts else ""
        _tbl_res = ", ".join(_table_adv_res_parts).strip(", ") if _table_adv_res_parts else ""
        adv_p = active_adv_petitioner or _tbl_pet
        adv_r = active_adv_respondent or _tbl_res

        cases.append(CaseEntry(
            list_type=doc_meta["list_type"],
            list_date=doc_meta["list_date"],
            court_no=current_court_no,
            bench=bench,
            judge=current_judge,
            section=active_section,
            item_no=current_item_no,
            main_case_no=active_main_case,
            linked_cases=list(active_linked),
            petitioner=pet,
            respondent=res,
            advocate_petitioner=adv_p,
            advocate_respondent=adv_r,
            raw_parties=raw_clean,
            source_pdf=source_pdf,
        ))

        active_main_case = None
        active_section = None
        active_linked = []
        active_parties_raw = []
        active_adv_petitioner = None
        active_adv_respondent = None
        active_table_adv_pet = None
        active_table_adv_resp = None
        _table_adv_pet_parts = []
        _table_adv_res_parts = []
        _seen_vs_line = False
        in_adv_block = False
        adv_accumulator.clear()
        current_item_no = None

    for i, line in enumerate(lines):

        # Advocate details block start
        if re.search(r"OTHER\s+DETAILS\s+OF\s+ADVOCATES", line, re.IGNORECASE):
            in_adv_block = True
            continue

        # Skip scheduling/disposed notation lines
        if re.search(r'[-]{3,}\s*(?:NOT\s+BEFORE|D/?o\.?)\b', line, re.IGNORECASE):
            continue

        # Section header
        _section_test = re.sub(r'\s*/\s*AT\s+\d{1,2}[.:]\d{2}\s*(?:AM|PM)?.*$', '', line, flags=re.IGNORECASE)
        if SECTION_HEADERS.match(_section_test):
            _sec = line.strip().upper().rstrip("-:/ ")
            _sec = re.sub(r"\s+", " ", _sec).strip()
            if _sec == "OF ISSUES" and current_section and "SHORT MATTERS" in (current_section or ""):
                _sec = "SHORT MATTERS/FRAMING OF ISSUES"
            elif _sec.startswith("SHORT MATTERS"):
                pass
            if "REGISTRAR" in _sec and not current_judge:
                current_judge = "REGISTRAR"
            current_section = _sec
            in_adv_block = False
            continue

        # Noise filter (not inside advocate-details block)
        if not in_adv_block and NOISE_REGEX.search(line):
            if active_main_case:
                _vs_in_noise = VS_REGEX.search(line)
                if _vs_in_noise:
                    active_parties_raw.append(line[_vs_in_noise.start():].strip())
                    _seen_vs_line = True
            continue

        # Court block header
        court_match = re.match(r"COURT\s+NO\.?\s*(\d+)", line, re.IGNORECASE)
        if court_match:
            flush()
            current_court_no = court_match.group(1)
            current_judge = None
            current_section = None
            in_adv_block = False
            bm_inline = re.search(r"((?:DIVISION|SINGLE|FULL)\s+BENCH[\w\s\-]*)", line, re.IGNORECASE)
            current_bench = bm_inline.group(1).strip() if bm_inline else None
            continue

        # Bench type
        if re.search(r"DIVISION\s+BENCH|SINGLE\s+BENCH|FULL\s+BENCH|DB\s*[-\u2013]", line, re.IGNORECASE):
            current_bench = line.strip()
            continue

        # Judge line
        if re.match(r"^\s*(?:HON[^\w\s]{0,3}BLE|CORAM\b|BEFORE\s+(?:HON|DR|MR|MS|SH)\.?)", line, re.IGNORECASE):
            if current_judge:
                current_judge = current_judge + "; " + line.strip()
            else:
                current_judge = line.strip()
            continue

        # Inside advocate block
        if in_adv_block:
            adv_m = ADVOCATE_DETAIL_REGEX.search(line)

            if not adv_m and adv_accumulator:
                combined_text = " ".join(adv_accumulator) + " " + line.strip()
                combined_m = ADVOCATE_DETAIL_REGEX.search(combined_text)
                if combined_m:
                    tag = combined_m.group(1).upper()
                    fp = combined_text.find("(")
                    if fp > 0:
                        name_text = combined_text[:fp].strip()
                    else:
                        name_text = combined_text[:combined_m.start()].strip()
                    parts = [p.strip() for p in name_text.split(",") if p.strip()]
                    name = parts[-1] if parts else name_text
                    name = _clean_advocate_name(name)
                    if tag in ("PETITIONER", "APPELLANT", "APPLICANT", "PLAINTIFF"):
                        if not active_adv_petitioner and name:
                            active_adv_petitioner = name
                    elif tag in ("RESPONDENT", "DEFENDANT", "INTERVENOR"):
                        if not active_adv_respondent and name:
                            active_adv_respondent = name
                    adv_accumulator = []
                    continue

            if adv_m:
                tag = adv_m.group(1).upper()

                if adv_accumulator:
                    full_entry = " ".join(adv_accumulator) + " " + line[:adv_m.start()]
                    fp = full_entry.find("(")
                    if fp > 0:
                        name_text = full_entry[:fp].strip()
                    else:
                        name_text = full_entry.strip()
                else:
                    name_source = line
                    first_paren = name_source.find("(")
                    if first_paren > 0:
                        name_text = name_source[:first_paren].strip()
                    else:
                        name_text = name_source[:adv_m.start()].strip()

                parts = [p.strip() for p in name_text.split(",") if p.strip()]
                name = parts[-1] if parts else name_text
                name = _clean_advocate_name(name)

                if tag in ("PETITIONER", "APPELLANT", "APPLICANT", "PLAINTIFF"):
                    if not active_adv_petitioner and name:
                        active_adv_petitioner = name
                elif tag in ("RESPONDENT", "DEFENDANT", "INTERVENOR"):
                    if not active_adv_respondent and name:
                        active_adv_respondent = name
                adv_accumulator = []
                continue

            _test_match = CASE_NO_REGEX.search(line)
            _is_new_case = (
                bool(_test_match) and not bool(
                    re.match(r"(?:CM\s+APPL?|I\.A\.)", _test_match.group("case"), re.IGNORECASE)
                )
            ) if _test_match else False
            _is_section = bool(SECTION_HEADERS.match(line))
            _is_court   = bool(re.match(r"COURT\s+NO\.?\s*\d+", line, re.IGNORECASE))
            _is_bench   = bool(re.search(r"DIVISION\s+BENCH|SINGLE\s+BENCH|FULL\s+BENCH", line, re.IGNORECASE))
            _is_judge   = bool(re.match(r"^\s*(?:HON[^\w\s]{0,3}BLE|CORAM\b|BEFORE\s+(?:HON|DR|MR|MS|SH)\.?)", line, re.IGNORECASE))
            _is_page_hdr = bool(re.match(r"\d{1,2}[./-]\d{1,2}[./-]\d{4}", line, re.IGNORECASE))

            if _is_new_case or _is_section or _is_court or _is_bench or _is_judge:
                in_adv_block = False
                adv_accumulator = []
            elif _is_page_hdr or re.match(r"^\d+$", line.strip()):
                continue
            else:
                adv_accumulator.append(line.strip())
                continue

        # WITH / In linked-case prefix
        with_m = re.match(r"^\s*(?:WITH|[Ii]n)\s+", line)
        if with_m and active_main_case:
            rest = line[with_m.end():]
            with_case = CASE_NO_REGEX.search(rest)
            if with_case:
                active_linked.append(re.sub(r"\s+", " ", with_case.group("case").strip()))
                wr = rest[with_case.end():].strip()
                wr = re.sub(r"\(Disposed\s+off[^)]*\)", "", wr, flags=re.IGNORECASE).strip()
                if wr:
                    active_parties_raw.append(wr)
                    if VS_REGEX.search(wr):
                        _seen_vs_line = True
                if i < len(_adv) and _adv[i].strip():
                    _adv_col_text = _adv[i].strip()
                    if not _OTHER_INFO_LEAK.search(_adv_col_text):
                        if _seen_vs_line:
                            _table_adv_res_parts.append(_adv_col_text)
                        else:
                            _table_adv_pet_parts.append(_adv_col_text)
                continue
            if VS_REGEX.search(line):
                _rest = line[with_m.end():].strip()
                if _rest:
                    active_parties_raw.append(_rest)
                    _seen_vs_line = True
            continue

        # Skip comma-separated case lists
        if re.search(r",\s*(?:FAO|W\.P|CS|CRL|OMP|ARB|RFA|MAC|LPA|ITA|RSA|HCP|CONT|MAT)", line, re.IGNORECASE):
            if not ITEM_LINE_REGEX.match(line):
                continue

        item_m = ITEM_LINE_REGEX.match(line)
        full_match = CASE_NO_REGEX.search(line)

        is_cm_appl = False
        if full_match:
            matched_text = full_match.group("case")
            is_cm_appl = bool(re.match(r"(?:CM\s+APPL?|I\.A\.)", matched_text, re.IGNORECASE)) and \
                         not re.search(
                             r"W\.P\.|CRL\.|LPA|FAO|RFA|RSA|CS\(|OMP|ARB|ITA|MAC|CONT|MAT|HCP|BAIL|TR\.P",
                             matched_text, re.IGNORECASE
                         )

        if is_cm_appl and active_main_case and not item_m:
            if full_match:
                active_linked.append(full_match.group("case").strip())
                cm_remainder = line[full_match.end():].strip()
                if cm_remainder:
                    active_parties_raw.append(cm_remainder)
                if cm_remainder and VS_REGEX.search(cm_remainder):
                    _seen_vs_line = True
                if i < len(_adv) and _adv[i].strip():
                    _adv_col_text = _adv[i].strip()
                    if not _OTHER_INFO_LEAK.search(_adv_col_text):
                        if _seen_vs_line:
                            _table_adv_res_parts.append(_adv_col_text)
                        else:
                            _table_adv_pet_parts.append(_adv_col_text)
            continue

        if is_cm_appl and (item_m or not active_main_case):
            is_cm_appl = False

        # New main case OR linked sub-case
        if full_match and not is_cm_appl:
            if not item_m and active_main_case:
                active_linked.append(re.sub(r"\s+", " ", full_match.group("case").strip()))
                _sub_remainder = line[full_match.end():].strip()
                while True:
                    _extra = CASE_NO_REGEX.match(_sub_remainder)
                    if _extra and re.match(r"CM\s+APPL?", _extra.group("case"), re.IGNORECASE):
                        active_linked.append(_extra.group("case").strip())
                        _sub_remainder = _sub_remainder[_extra.end():].strip()
                    else:
                        break
                if _sub_remainder:
                    active_parties_raw.append(_sub_remainder)
                    if VS_REGEX.search(_sub_remainder):
                        _seen_vs_line = True
                if i < len(_adv) and _adv[i].strip():
                    _adv_col_text = _adv[i].strip()
                    if not _OTHER_INFO_LEAK.search(_adv_col_text):
                        if _seen_vs_line:
                            _table_adv_res_parts.append(_adv_col_text)
                        else:
                            _table_adv_pet_parts.append(_adv_col_text)
                continue

            flush()
            in_adv_block = False
            active_section = current_section
            if item_m:
                current_item_no = item_m.group(1)
            active_main_case = re.sub(r"\s+", " ", full_match.group("case").strip())
            _table_adv_pet_parts = []
            _table_adv_res_parts = []
            _seen_vs_line = False
            if i < len(_adv) and _adv[i].strip():
                _adv_col_text = _adv[i].strip()
                if not _OTHER_INFO_LEAK.search(_adv_col_text):
                    _table_adv_pet_parts.append(_adv_col_text)

            remainder = line[full_match.end():].strip()
            remainder = re.sub(
                r"^(?:CM\s+APPL?\.?|I\.A\.)\s*[\d/,\s]+\s*",
                "", remainder, flags=re.IGNORECASE
            ).strip()

            while True:
                extra = CASE_NO_REGEX.match(remainder)
                if extra and re.match(r"CM\s+APPL?", extra.group("case"), re.IGNORECASE):
                    active_linked.append(extra.group("case").strip())
                    remainder = remainder[extra.end():].strip()
                else:
                    break

            if remainder:
                active_parties_raw.append(remainder)
                if VS_REGEX.search(remainder):
                    _seen_vs_line = True
            continue

        # Party/continuation line
        if active_main_case and not in_adv_block:
            if EMAIL_REGEX.search(line) or PHONE_REGEX.search(line):
                continue
            if VS_REGEX.search(line):
                _seen_vs_line = True
            active_parties_raw.append(line.strip())
            if i < len(_adv) and _adv[i].strip():
                _adv_col_text = _adv[i].strip()
                if not _OTHER_INFO_LEAK.search(_adv_col_text):
                    if _seen_vs_line:
                        _table_adv_res_parts.append(_adv_col_text)
                    else:
                        _table_adv_pet_parts.append(_adv_col_text)

    flush()

    # POST-PROCESSING

    # 1. Inherit petitioner for cases that start with V/s
    for idx in range(1, len(cases)):
        c = cases[idx]
        if not c.petitioner and c.raw_parties.startswith("V/s"):
            for j in range(idx - 1, max(idx - 10, -1), -1):
                prev = cases[j]
                if prev.court_no == c.court_no and prev.petitioner:
                    c.petitioner = prev.petitioner
                    break

    # 2. Inherit missing section from neighboring cases in same court
    for idx in range(len(cases)):
        c = cases[idx]
        if not c.section:
            for j in range(idx + 1, min(idx + 15, len(cases))):
                nxt = cases[j]
                if nxt.court_no == c.court_no and nxt.section:
                    c.section = nxt.section
                    break
            if not c.section:
                for j in range(idx - 1, max(idx - 15, -1), -1):
                    prev = cases[j]
                    if prev.court_no == c.court_no and prev.section:
                        c.section = prev.section
                        break

    # 3. Inherit missing item_no for sub-cases from parent
    for idx in range(len(cases)):
        c = cases[idx]
        if not c.item_no and re.match(r"(?:I\.A\.|CM\s+APPL)", c.main_case_no, re.IGNORECASE):
            for j in range(idx - 1, max(idx - 10, -1), -1):
                prev = cases[j]
                if prev.court_no == c.court_no and prev.item_no:
                    c.item_no = prev.item_no
                    break

    logger.info("Parsed %d cases from %s", len(cases), source_pdf)
    return cases


# ═════════════════════════════════════════════════════════════════════════════
# CONVENIENCE: Parse a PDF file end-to-end
# ═════════════════════════════════════════════════════════════════════════════

def parse_pdf(pdf_path: str) -> List[CaseEntry]:
    """One-call parse: extract lines from PDF and return structured cases.

    Parameters
    ----------
    pdf_path : Path to the DHC cause list PDF file.

    Returns
    -------
    List[CaseEntry]

    Raises
    ------
    FileNotFoundError : if pdf_path doesn't exist
    """
    import os
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    lines, adv_texts = extract_lines(pdf_path)
    cases = parse_cases(lines, os.path.basename(pdf_path), adv_texts)
    return cases
