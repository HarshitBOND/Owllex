import { NextRequest, NextResponse } from "next/server"
import CauseListCase from "../../lib/models/causelist-cases"
import connectMongoWithRetry from "../../lib/db/connectMongo"

function escapeRegexLiteral(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFlexibleCaseTypePattern(caseType: string) {
  // We'll iterate characters and build a pattern allowing flexible whitespace around punctuation.
  const special = new Set(['.', '(', ')', '-', ',', '&', '/']);
  let out = '';

  for (let i = 0; i < caseType.length; i++) {
    const ch = caseType[i];

    if (/\s/.test(ch)) {
      // a space in input -> allow one or more whitespace in DB
      out += '\\s+';
      continue;
    }

    if (ch === '.') {
      // require the dot but allow spaces around it:  \s*\.\s*
      out += '\\s*\\.\\s*';
      continue;
    }

    if (ch === '(') {
      out += '\\s*\\(\\s*'; // allow spaces before/after '('
      continue;
    }

    if (ch === ')') {
      out += '\\s*\\)\\s*'; // allow spaces before/after ')'
      continue;
    }

    if (ch === '-') {
      out += '\\s*-\\s*'; // allow spaces around hyphen
      continue;
    }

    if (ch === ',') {
      out += '\\s*,\\s*';
      continue;
    }

    if (ch === '&') {
      out += '\\s*&\\s*';
      continue;
    }

    if (ch === '/') {
      // In caseType it's uncommon but be safe
      out += '\\s*/\\s*';
      continue;
    }

    // default: escape the char if needed
    out += escapeRegexLiteral(ch);
  }

  // collapse multiple \s+ or \s* sequences (optional but tidy)
  out = out.replace(/(\\s\+){2,}/g, '\\s+').replace(/(\\s\*\.)/g, '\\s*\\.');

  return out;
}

async function findCasesByParts(caseType: string, caseNumber: string, caseYear: string) {
  // normalized inputs (trim)
  caseType = String(caseType || '').trim();
  caseNumber = String(caseNumber || '').trim();
  caseYear = String(caseYear || '').trim();

  // 1) build the flexible case-type pattern (dots required but with spaces allowed)
  const patternStrict = buildFlexibleCaseTypePattern(caseType);

  // We want to ensure we match the intended caseNumber/caseYear (not later numbers).
  // Use [^0-9]* between caseType and the desired number to avoid jumping to later numeric groups.
  const numAndYear = `${escapeRegexLiteral(caseNumber)}\\s*/\\s*${escapeRegexLiteral(caseYear)}`;

  // final strict regex string
  const regexStrict = `${patternStrict}[^0-9]*${numAndYear}`;

  // 2) relaxed pattern: allow dots to be optional (if strict fails)
  // We make dots optional by replacing `\\s*\\.\\s*` with `\\s*\\.?\\s*`
  const patternRelaxed = patternStrict.replace(/\\s*\\.\\s*/g, '\\s*\\.?\\s*');
  const regexRelaxed = `${patternRelaxed}[^0-9]*${numAndYear}`;

  // Try strict first
  let foundCases = await CauseListCase.find({
    case_no: { $regex: regexStrict, $options: 'i' }
  });

  if (foundCases && foundCases.length > 0) {
    return foundCases;
  }

  // fallback to relaxed (more permissive)
  foundCases = await CauseListCase.find({
    case_no: { $regex: regexRelaxed, $options: 'i' }
  });

  return foundCases || [];
}

export async function GET(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const caseId = req.nextUrl.searchParams.get("id")
        if (caseId) {
            const caseFound = await CauseListCase.findById(caseId)
            return NextResponse.json({ caseFound })
        }
        return NextResponse.json({ error: "CaseId not found" }, { status: 404 })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const caseData = await req.json()
        const { caseNumber, caseType, forum, caseYear, advocateName } = caseData
        await connectMongoWithRetry()

        if (!caseNumber && !caseType && forum) {
            const foundCases = await CauseListCase.find({ advocate: {$regex: advocateName, $options: "i"}, case_no: {$regex: caseYear, $options: "i"} })
            return NextResponse.json({ cases: foundCases }, { status: 200 })
        } else {

            const foundCases = await findCasesByParts(caseType, caseNumber, caseYear);

            return NextResponse.json({ cases: foundCases }, { status: 200 });

        }

    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}