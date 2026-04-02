import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import CauseListCase from "../../lib/models/causelist-cases"
import ScrapedCase from "../../lib/models/scraped-case"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { enforceRateLimit, parseAndValidateJson } from "@/app/api/lib/routeGuards"

function escapeRegexLiteral(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFlexibleCaseTypePattern(caseType: string) {
  let out = '';

  for (let i = 0; i < caseType.length; i++) {
    const ch = caseType[i];

    if (/\s/.test(ch)) {
      out += '\\s+';
      continue;
    }
    if (ch === '.') {
      out += '\\s*\\.\\s*';
      continue;
    }
    if (ch === '(') {
      out += '\\s*\\(\\s*';
      continue;
    }
    if (ch === ')') {
      out += '\\s*\\)\\s*';
      continue;
    }
    if (ch === '-') {
      out += '\\s*-\\s*';
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
      out += '\\s*/\\s*';
      continue;
    }
    out += escapeRegexLiteral(ch);
  }

  out = out.replace(/(\\s\+){2,}/g, '\\s+').replace(/(\\s\*\.)/g, '\\s*\\.');
  return out;
}

// Transform a ScrapedCase document to match CauseListCase format for the frontend
function normalizeScrapedCase(sc: any) {
  return {
    _id: sc._id,
    item_no: sc.item_no || "",
    case_no: sc.main_case_no,
    case_title: sc.petitioner && sc.respondent
      ? `${sc.petitioner} VS. ${sc.respondent}`
      : sc.petitioner || sc.respondent || sc.raw_parties || sc.main_case_no,
    advocate: sc.advocate_petitioner || "",
    case_stage: sc.section || "",
    remarks: "",
    links: [],
    court_name: "DELHI HIGH COURT",
    court_value: sc.court_no || "",
    cause_list_date: sc.list_date || "",
    scrapped_at: sc.parsed_at || null,
    uid: sc.source_pdf || "",
    _source: "scraped_cases",
  };
}

async function findCasesByParts(caseType: string, caseNumber: string, caseYear: string) {
  caseType = String(caseType || '').trim();
  caseNumber = String(caseNumber || '').trim();
  caseYear = String(caseYear || '').trim();

  const patternStrict = buildFlexibleCaseTypePattern(caseType);
  const numAndYear = `${escapeRegexLiteral(caseNumber)}\\s*/\\s*${escapeRegexLiteral(caseYear)}`;
  const regexStrict = `${patternStrict}[^0-9]*${numAndYear}`;

  const patternRelaxed = patternStrict.replace(/\\s*\\.\\s*/g, '\\s*\\.?\\s*');
  const regexRelaxed = `${patternRelaxed}[^0-9]*${numAndYear}`;

  // Search CauseListCase collection first (strict then relaxed)
  let foundCases = await CauseListCase.find({
    case_no: { $regex: regexStrict, $options: 'i' }
  });
  if (foundCases && foundCases.length > 0) return foundCases;

  foundCases = await CauseListCase.find({
    case_no: { $regex: regexRelaxed, $options: 'i' }
  });
  if (foundCases && foundCases.length > 0) return foundCases;

  // Fallback: search ScrapedCase collection (main_case_no field)
  let scrapedCases = await ScrapedCase.find({
    main_case_no: { $regex: regexStrict, $options: 'i' }
  });
  if (scrapedCases && scrapedCases.length > 0) {
    return scrapedCases.map(normalizeScrapedCase);
  }

  scrapedCases = await ScrapedCase.find({
    main_case_no: { $regex: regexRelaxed, $options: 'i' }
  });
  if (scrapedCases && scrapedCases.length > 0) {
    return scrapedCases.map(normalizeScrapedCase);
  }

  return [];
}

export async function GET(req: NextRequest) {
    try {
    const { blockedResponse } = await enforceRateLimit(req, {
      key: "public:cases:get",
      max: 180,
      windowMs: 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

        await connectMongoWithRetry()
        const caseId = req.nextUrl.searchParams.get("id")
        if (caseId) {
            // Try CauseListCase first, then ScrapedCase
            const caseFound = await CauseListCase.findById(caseId)
            if (caseFound) {
                return NextResponse.json({ caseFound })
            }
            const scrapedCase = await ScrapedCase.findById(caseId)
            if (scrapedCase) {
                return NextResponse.json({ caseFound: normalizeScrapedCase(scrapedCase) })
            }
            return NextResponse.json({ error: "Case not found" }, { status: 404 })
        }
        return NextResponse.json({ error: "CaseId not found" }, { status: 404 })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
    const { blockedResponse } = await enforceRateLimit(req, {
      key: "public:cases:post",
      max: 80,
      windowMs: 60 * 1000,
    })

    if (blockedResponse) {
      return blockedResponse
    }

    const requestSchema = z.object({
      caseNumber: z.string().trim().max(30).optional().default(""),
      caseType: z.string().trim().max(40).optional().default(""),
      forum: z.string().trim().max(80).optional().default(""),
      caseYear: z.string().trim().max(16).optional().default(""),
      advocateName: z.string().trim().max(128).optional().default(""),
    })

    const parsedBody = await parseAndValidateJson(req, requestSchema)
    if (!parsedBody.success) {
      return parsedBody.response
    }

    const { caseNumber, caseType, forum, caseYear, advocateName } = parsedBody.data
    const safeAdvocateName = escapeRegexLiteral(String(advocateName || "").trim().slice(0, 128))
    const safeCaseYear = escapeRegexLiteral(String(caseYear || "").trim().slice(0, 16))
        await connectMongoWithRetry()

        if (!caseNumber && !caseType && forum) {
            // Advocate name search — search both collections
            let foundCases = await CauseListCase.find({
              advocate: { $regex: safeAdvocateName, $options: "i" },
              case_no: { $regex: safeCaseYear, $options: "i" }
            })
            if (!foundCases || foundCases.length === 0) {
                const scrapedCases = await ScrapedCase.find({
                advocate_petitioner: { $regex: safeAdvocateName, $options: "i" },
                main_case_no: { $regex: safeCaseYear, $options: "i" }
                })
                foundCases = scrapedCases.map(normalizeScrapedCase)
            }
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