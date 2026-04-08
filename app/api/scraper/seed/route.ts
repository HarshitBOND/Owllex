/**
 * API Route: POST /api/scraper/seed
 * Seeds 3 days of realistic dummy data for testing the scraper dashboard.
 */

import { NextResponse } from "next/server";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import DownloadedPDF from "@/app/api/lib/models/downloaded-pdf";
import ScrapedCase from "@/app/api/lib/models/scraped-case";
import ScraperLog from "@/app/api/lib/models/scraper-log";
import { requireAdmin } from "@/app/api/lib/adminAuth";

// ── Dummy data generators ──────────────────────────────────────────────────

const JUDGES = [
  "HON'BLE MR. JUSTICE RAJIV SHAKDHER",
  "HON'BLE MR. JUSTICE SACHIN DATTA",
  "HON'BLE MR. JUSTICE SUBRAMONIUM PRASAD",
  "HON'BLE MS. JUSTICE MINI PUSHKARNA",
  "HON'BLE MR. JUSTICE ANUP JAIRAM BHAMBHANI",
  "HON'BLE MR. JUSTICE NAVIN CHAWLA",
  "HON'BLE MR. JUSTICE DHARMESH SHARMA",
  "HON'BLE MS. JUSTICE REKHA PALLI",
  "HON'BLE MR. JUSTICE VIBHU BAKHRU",
  "HON'BLE MS. JUSTICE JYOTI SINGH",
];

const PETITIONERS = [
  "RAJESH KUMAR", "SONIA GUPTA & ANR.", "DR. SATENDRA SINGH & ANR.",
  "M/S. TATA CONSULTANCY SERVICES LTD.", "UNION PUBLIC SERVICE COMMISSION",
  "DELHI TRANSPORT CORPORATION", "PRIYA SHARMA & ORS.",
  "M/S. RELIANCE INDUSTRIES LTD.", "ARUN JAITLEY MEMORIAL TRUST",
  "NATIONAL HIGHWAYS AUTHORITY OF INDIA", "AMIT SINGH CHAUHAN",
  "MUNICIPAL CORPORATION OF DELHI", "GURPREET KAUR & ANR.",
  "M/S. BHARTI AIRTEL LTD.", "VIKRAM MALHOTRA",
  "CENTRAL BUREAU OF INVESTIGATION", "NEHA VERMA & ORS.",
  "M/S. INFOSYS TECHNOLOGIES LTD.", "SURESH CHANDRA AGARWAL",
  "DIRECTORATE OF ENFORCEMENT",
];

const RESPONDENTS = [
  "UNION OF INDIA & ORS.", "STATE OF NCT OF DELHI",
  "COMMISSIONER OF INCOME TAX", "GOVT. OF NCT OF DELHI & ORS.",
  "DELHI DEVELOPMENT AUTHORITY", "CENTRAL BOARD OF DIRECT TAXES",
  "RESERVE BANK OF INDIA", "SECURITIES AND EXCHANGE BOARD OF INDIA",
  "FOOD CORPORATION OF INDIA", "AIRPORT AUTHORITY OF INDIA & ORS.",
  "MINISTRY OF HOME AFFAIRS", "DELHI POLICE",
  "MINISTRY OF FINANCE", "CENTRAL POLLUTION CONTROL BOARD",
  "DIRECTORATE GENERAL OF FOREIGN TRADE",
];

const ADV_PET = [
  "MAYANK SAPRA", "RAHUL MEHRA SR. ADV.", "ANUJ AGGARWAL",
  "PRASHANT BHUSHAN", "SANJAY JAIN ASG", "VIKRAM CHAUDHARI",
  "DAYAN KRISHNAN SR. ADV.", "RAJIV DUTTA", "AMAN LEKHI ASG",
  "NEERAJ KISHAN KAUL", "GOPAL SHANKARNARAYANAN", "SAURABH KIRPAL",
];

const ADV_RES = [
  "TUSHAR MEHTA SG", "RAJAT NAIR", "ANIL SONI CGSC",
  "HARISH SALVE SR. ADV.", "MUKUL ROHATGI SR. ADV.", "RITIN RAI",
  "CHETAN SHARMA ASG", "PINKY ANAND", "BALBIR SINGH ASG",
  "MANINDER SINGH SR. ADV.",
];

const CASE_TYPES = [
  "W.P.(C)", "W.P.(CRL)", "CRL.M.C.", "FAO", "RFA", "OMP (COMM.)",
  "CS (COMM.)", "CRL.A.", "CM APPL.", "LPA", "MAT.APP.",
  "EX.P.", "CO.PET.", "CONT.CAS(C)", "RFA (OS)",
];

const SECTIONS = [
  "FOR ADMISSION", "AFTER NOTICE", "FOR ORDERS/DIRECTIONS",
  "FOR HEARING", "FOR ARGUMENTS", "FOR PRONOUNCEMENT",
  "FRESH CASES", "REGULAR MATTERS",
];

const LIST_TYPES = ["ADVANCE", "COMBINED", "SUPPLEMENTARY", "DAILY"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randCaseNo(): string {
  const type = pick(CASE_TYPES);
  const num = Math.floor(1000 + Math.random() * 90000);
  const year = pick(["2023", "2024", "2025", "2026"]);
  return `${type} ${num}/${year}`;
}

function makeHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(16, "0") + Math.random().toString(16).slice(2, 18);
}

function generateCasesForPdf(
  pdfFilename: string,
  listDate: string,
  count: number,
  parsedAt: Date
) {
  const cases = [];
  for (let i = 0; i < count; i++) {
    const courtNum = Math.floor(1 + Math.random() * 40);
    cases.push({
      list_type: pick(LIST_TYPES),
      list_date: listDate,
      court_no: `COURT NO. ${String(courtNum).padStart(2, "0")}`,
      bench: pick(["SINGLE BENCH", "DIVISION BENCH-I", "DIVISION BENCH-II"]),
      judge: pick(JUDGES),
      section: pick(SECTIONS),
      item_no: String(i + 1),
      main_case_no: randCaseNo(),
      linked_cases: Math.random() > 0.6 ? [randCaseNo()] : [],
      petitioner: pick(PETITIONERS),
      respondent: pick(RESPONDENTS),
      advocate_petitioner: pick(ADV_PET),
      advocate_respondent: pick(ADV_RES),
      raw_parties: "",
      source_pdf: pdfFilename,
      parsed_at: parsedAt,
      status: "extracted",
    });
  }
  return cases;
}

// ── Seed handler ───────────────────────────────────────────────────────────

export async function POST() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    await connectMongoWithRetry();

    // Clear existing scraper data first
    await Promise.all([
      DownloadedPDF.deleteMany({}),
      ScrapedCase.deleteMany({}),
      ScraperLog.deleteMany({}),
    ]);

    // Generate for 3 days: March 7, 8, 9 2026
    const days = [
      { date: new Date("2026-03-07T06:00:00Z"), dateStr: "07.03.2026" },
      { date: new Date("2026-03-08T06:00:00Z"), dateStr: "08.03.2026" },
      { date: new Date("2026-03-09T06:00:00Z"), dateStr: "09.03.2026" },
    ];

    const allPdfs: Array<Record<string, unknown>> = [];
    const allCases: Array<Record<string, unknown>> = [];
    const allLogs: Array<Record<string, unknown>> = [];

    for (const day of days) {
      // Each day has 2-3 PDFs
      const pdfCount = 2 + Math.floor(Math.random() * 2);
      const dayPdfs = [];
      let dayCasesTotal = 0;

      for (let p = 0; p < pdfCount; p++) {
        const suffixes = ["advance", "combined", "supplementary", "new_cases"];
        const suffix = suffixes[p] || `extra_${p}`;
        const filename = `cause_list_${day.dateStr.replace(/\./g, "_")}_${suffix}.pdf`;
        const casesCount = 8 + Math.floor(Math.random() * 30);
        const parsedAt = new Date(day.date.getTime() + (15 + p * 10) * 60000);
        const execTime = 2 + Math.random() * 8;

        const pdfDoc = {
          filename,
          download_url: `https://delhihighcourt.nic.in/web/cause-lists/${filename}`,
          downloaded_at: new Date(day.date.getTime() + p * 5 * 60000),
          file_size_bytes: Math.floor(500000 + Math.random() * 3000000),
          file_hash: makeHash(filename + day.dateStr),
          parse_status: "completed" as const,
          cases_extracted: casesCount,
          processed: true,
          deleted_at: new Date(parsedAt.getTime() + 30000),
          execution_time_seconds: Math.round(execTime * 100) / 100,
          error_message: null,
        };
        allPdfs.push(pdfDoc);
        dayPdfs.push({ filename, casesCount, execTime });
        dayCasesTotal += casesCount;

        const cases = generateCasesForPdf(filename, day.dateStr, casesCount, parsedAt);
        allCases.push(...cases);
      }

      // Scraper log for this day
      const totalExecTime = dayPdfs.reduce((s, p) => s + p.execTime, 0);
      allLogs.push({
        run_date: day.date,
        pdfs_found: pdfCount + Math.floor(Math.random() * 2),
        pdfs_downloaded: pdfCount,
        pdfs_skipped: Math.floor(Math.random() * 2),
        cases_extracted: dayCasesTotal,
        execution_time_seconds: Math.round(totalExecTime * 100) / 100,
        status: "success",
        error_message: null,
        results: dayPdfs.map((p) => ({
          filename: p.filename,
          status: "completed",
          cases_extracted: p.casesCount,
        })),
      });
    }

    // Insert into DB (use insertMany; duplicates shouldn't happen since we cleared)
    await DownloadedPDF.insertMany(allPdfs);
    // Insert cases one by one to handle the unique constraint gracefully
    let casesInserted = 0;
    for (const c of allCases) {
      try {
        await ScrapedCase.create(c);
        casesInserted++;
      } catch {
        // duplicate — skip
      }
    }
    await ScraperLog.insertMany(allLogs);

    return NextResponse.json({
      success: true,
      message: `Seeded 3 days of dummy data`,
      summary: {
        pdfs: allPdfs.length,
        cases: casesInserted,
        logs: allLogs.length,
      },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
