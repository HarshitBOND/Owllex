"""
Ravenslaw Data Models — CaseEntry dataclass + Pydantic response schemas.
"""

from dataclasses import dataclass, asdict, field
from typing import List, Optional
from pydantic import BaseModel


# ─────────────────────────────────────────────────────────────────────────────
# Core dataclass (used internally by the parser)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CaseEntry:
    """One item in the cause list = one CaseEntry."""
    list_type: Optional[str]        # ADVANCE / COMBINED / SUPPLEMENTARY / DAILY
    list_date: Optional[str]        # DD.MM.YYYY from header
    court_no: Optional[str]         # COURT NO. 01
    bench: Optional[str]            # DIVISION BENCH-I / SINGLE BENCH
    judge: Optional[str]            # HON'BLE MR.JUSTICE TEJAS KARIA
    section: Optional[str]          # FOR ADMISSION / AFTER NOTICE / etc.
    item_no: Optional[str]          # 1, 2, 3 …
    main_case_no: str               # W.P.(C) 16325/2024
    linked_cases: List[str]         # [CM APPL. 79765/2025, ...]
    petitioner: str                 # DR SATENDRA SINGH & ANR.
    respondent: str                 # UNION OF INDIA & ORS.
    advocate_petitioner: str        # MAYANK SAPRA
    advocate_respondent: str        # (from OTHER DETAILS block)
    raw_parties: str                # full party text as fallback
    source_pdf: Optional[str]

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas (for API request/response validation)
# ─────────────────────────────────────────────────────────────────────────────

class CaseResponse(BaseModel):
    list_type: Optional[str] = None
    list_date: Optional[str] = None
    court_no: Optional[str] = None
    bench: Optional[str] = None
    judge: Optional[str] = None
    section: Optional[str] = None
    item_no: Optional[str] = None
    main_case_no: str
    linked_cases: List[str] = []
    petitioner: str = ""
    respondent: str = ""
    advocate_petitioner: str = ""
    advocate_respondent: str = ""
    raw_parties: str = ""
    source_pdf: Optional[str] = None


class ParseResponse(BaseModel):
    success: bool
    filename: str
    total_cases: int
    cases: List[CaseResponse]


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    mongodb: str = "not configured"
