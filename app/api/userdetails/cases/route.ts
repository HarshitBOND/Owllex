import { NextRequest, NextResponse } from "next/server"
import CauseListCase from "../../lib/models/causelist-cases"
import Case from "../../lib/models/case"
import User from "../../lib/models/user"
import ScrapedCase from "../../lib/models/scraped-case"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server";
import axios from "axios";
import * as cheerio from "cheerio";
import Client from "../../lib/models/client"
import mongoose from "mongoose"
import { ensureUser } from "../../lib/ensureUser"
import { syncCalendarEventsForUser } from "../../lib/services/calendar"
import { appendCourtDateChange } from "../../lib/services/caseHearing"
import { reconcileNotificationsForCase } from "../../lib/services/notifications"
import { checkCaseCreationAllowance } from "../../lib/services/subscription"
import { formatDateKey, parseCourtDate } from "@/lib/hearingDates"


function toSnakeCase(str: string): string {
  return str
    .replace(/[:.]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

async function scrapeData(url: string) {
  try {
    // Validate URL before fetching
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('delhihighcourt.nic.in') && !parsed.hostname.endsWith('.gov.in')) {
      console.warn('Skipping scrape for non-court URL:', url);
      return { case_details: {}, filing_details: [], listing_details: [] };
    }
    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
    });

    const $ = cheerio.load(html);

    // 🧩 1. Extract main key-value data
    const caseData: Record<string, string> = {};
    $("label").each((_, label) => {
      const bold = $(label).find("b");
      if (bold.length > 0) {
        const key = toSnakeCase(bold.text());
        const value = $(label).text().replace(bold.text(), "").trim();
        caseData[key] = value;
      }
    });

    // 🧩 2. Extract Filing Details
    const filingDetailsList: { srlNo: string; date: string; filingDetails: string }[] = [];
    $("#filingDetailsSection table tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        const srlNo = $(tds[0]).text().trim();
        const date = $(tds[1]).text().trim();
        const filingDetails = $(tds[2]).text().trim().replace(/\s+/g, " ");
        filingDetailsList.push({ srlNo, date, filingDetails });
      }
    });

    // 🧩 3. Extract Listing Details
    const listingDetailsList: { srlNo: string; date: string; listingDetails: string }[] = [];
    $("#listingDetailsSection table tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        const srlNo = $(tds[0]).text().trim();
        const date = $(tds[1]).text().trim();
        const listingDetails = $(tds[2]).text().trim().replace(/\s+/g, " ");
        listingDetailsList.push({ srlNo, date, listingDetails });
      }
    });

    // 🧩 4. Combine results
    const result = {
      case_details: caseData,
      filing_details: filingDetailsList,
      listing_details: listingDetailsList,
    };

    return result
  } catch (err) {
    console.error("Error fetching page:", err);
  }
}

export async function GET(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        await ensureUser(userId);
        const caseId = req.nextUrl.searchParams.get("id")
        if (caseId) {
            const caseFound = await Case.findById(caseId).populate("notes").populate("clients").populate("tasks")
            // Look up the latest cause list entry matching this case number
            let causeListInfo = null;
            if (caseFound?.caseNo) {
                const latestScraped = await ScrapedCase.findOne({
                    main_case_no: { $regex: `^${caseFound.caseNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
                }).sort({ parsed_at: -1 }).lean();
                if (latestScraped) {
                    causeListInfo = latestScraped;
                }
            }
            return NextResponse.json({ caseFound, causeListInfo })
        }
        const userCases = await User.findOne( {clerkUid: userId} ).populate("cases")
        return NextResponse.json({ userCases })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        const caseData = await req.json()
        await ensureUser(userId);

        const user = await User.findOne( {clerkUid: userId} )

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
        }

        const caseCreationAllowance = await checkCaseCreationAllowance(userId)
        if (!caseCreationAllowance.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: caseCreationAllowance.reason,
                    subscription: caseCreationAllowance.subscription,
                },
                { status: 403 },
            )
        }

        const client = caseData.client ? await Client.findById(caseData.client) : null

        // Try CauseListCase first, then fall back to ScrapedCase
        let caseFound = await CauseListCase.findById(caseData.caseId)
        let fromScraped = false
        if (!caseFound) {
            caseFound = await ScrapedCase.findById(caseData.caseId)
            fromScraped = true
        }
        if (!caseFound) {
            return NextResponse.json({ success: false, error: "Case not found in database" }, { status: 404 })
        }

        // Normalize field names depending on source
        const sourceCaseNo = fromScraped ? caseFound.main_case_no : caseFound.case_no
        const sourceCaseTitle = fromScraped
            ? (caseFound.petitioner && caseFound.respondent
                ? `${caseFound.petitioner} VS. ${caseFound.respondent}`
                : caseFound.petitioner || caseFound.respondent || caseFound.raw_parties || caseFound.main_case_no)
            : caseFound.case_title
        const sourceAdvocate = fromScraped ? (caseFound.advocate_petitioner || "") : caseFound.advocate
        const sourceCaseStage = fromScraped ? (caseFound.section || "") : caseFound.case_stage
        const sourceRemarks = fromScraped ? "" : (caseFound.remarks || "")
        const sourceLinks = fromScraped ? [] : (caseFound.links || [])
        const sourceDocuments = fromScraped ? [] : (caseFound.documents || [])
        const sourceCourtName = fromScraped ? "DELHI HIGH COURT" : caseFound.court_name
        const sourceCourtValue = fromScraped ? (caseFound.court_no || "") : caseFound.court_value
        const sourceCourtRoom = fromScraped ? (caseFound.court_no || "") : caseFound.court_room
        const sourceCourtDate = fromScraped ? (caseFound.list_date || "") : caseFound.court_date
        const parsedSourceCourtDate = parseCourtDate(sourceCourtDate)
        const normalizedSourceCourtDate = parsedSourceCourtDate ? formatDateKey(parsedSourceCourtDate) : ""

        // Scrape court website for additional details (non-blocking on failure)
        let scrapedData = { case_details: {} as Record<string,string>, filing_details: [] as any[], listing_details: [] as any[] };
        if (sourceLinks.length > 1 && sourceLinks[1]) {
            try {
                scrapedData = (await scrapeData(sourceLinks[1])) || scrapedData;
            } catch (e) {
                console.warn('Scraping failed, continuing with cause list data only');
            }
        }
        const { case_details: data, filing_details: filingDetails, listing_details: listingDetails } = scrapedData;

        const clientIds: any[] = [];
        if (client) {
            clientIds.push(client._id);
        }
            
        const formattedCase = {
            fileNo: caseData.fileNumber || Math.random().toString(36).substring(2, 9).toUpperCase(),
            caseNo: data?.["case_no"] || sourceCaseNo,
            cnrNo: data?.["cnr_no"],
            caseTitle: sourceCaseTitle,
            advocate: sourceAdvocate,
            caseStage: sourceCaseStage,
            remarks: sourceRemarks,
            links: sourceLinks,
            documents: sourceDocuments,
            courtName: sourceCourtName,
            courtValue: sourceCourtValue,
            courtRoom: sourceCourtRoom,
            courtDate: normalizedSourceCourtDate || sourceCourtDate,
            fillingAdvocate: data?.["filing_advocate"],
            fillingDate: data?.["date_of_filing"],
            status: data?.["status"],
            registrationDate: data?.["date_of_registration"],
            filingDetails:  filingDetails,
            listingDetails: listingDetails,
            hearingHistory: [],
            courtDateAuditTrail: [],
            notes: [],
            clients: clientIds,
        }

        const caseCreated = await Case.create(formattedCase)

        if (normalizedSourceCourtDate) {
            appendCourtDateChange({
                caseDocument: caseCreated,
                nextCourtDate: normalizedSourceCourtDate,
                previousCourtDate: null,
                reason: "Initial court date imported during case creation",
                listingDetails: "",
                changedByClerkUid: userId,
                source: "case-create",
                type: "created",
            })

            caseCreated.courtDate = normalizedSourceCourtDate
            await caseCreated.save()
        }

        user.cases.push(caseCreated._id)
        if (client) {
            client.cases.push(caseCreated._id)
            await client.save()
        }
        await user.save()
        if (userId) {
            await syncCalendarEventsForUser(userId)
        }

        return NextResponse.json({ success: true, caseId: caseCreated._id })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const { userId } = await auth();
        const caseId = req.nextUrl.searchParams.get("caseId") || req.nextUrl.searchParams.get("id")
        const clientId = req.nextUrl.searchParams.get("clientId")

        if (!userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        await ensureUser(userId)

        if (!caseId) {
            return NextResponse.json({ success: false, error: "Case ID required" }, { status: 400 })
        }

        // If clientId provided, just unlink the client from the case
        if (clientId) {
            const isOwnedCase = await User.exists({ clerkUid: userId, cases: caseId })
            if (!isOwnedCase) {
                return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 })
            }

            const caseFound = await Case.findById(caseId)
            const clientFound = await Client.findById(clientId)
            if (caseFound && clientFound && caseFound.clients.filter((client: mongoose.Schema.Types.ObjectId) => client.toString() === clientId).length > 0) {
                caseFound.clients.pull(clientId)
                clientFound.cases.pull(caseId)
                await caseFound.save()
                await clientFound.save()
                return NextResponse.json({ success: true })
            }
            return NextResponse.json({ success: false, error: "Client not linked to case" })
        }

        // Delete the entire case
        const isOwnedCase = await User.exists({ clerkUid: userId, cases: caseId })
        if (!isOwnedCase) {
            return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 })
        }

        const caseFound = await Case.findById(caseId)
        if (!caseFound) {
            return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 })
        }

        // Remove case reference from user
        if (userId) {
            await User.findOneAndUpdate({ clerkUid: userId }, { $pull: { cases: caseFound._id } })
        }

        // Remove case reference from all linked clients
        if (caseFound.clients && caseFound.clients.length > 0) {
            await Client.updateMany(
                { _id: { $in: caseFound.clients } },
                { $pull: { cases: caseFound._id } }
            )
        }

        // Delete associated tasks
        if (caseFound.tasks && caseFound.tasks.length > 0) {
            const Task = (await import("../../lib/models/task")).default;
            await Task.deleteMany({ _id: { $in: caseFound.tasks } })
        }

        // Delete associated notes
        if (caseFound.notes && caseFound.notes.length > 0) {
            const Note = (await import("../../lib/models/note")).default;
            await Note.deleteMany({ _id: { $in: caseFound.notes } })
        }

        await reconcileNotificationsForCase(caseId, null)

        await Case.findByIdAndDelete(caseId)

        if (userId) {
            await syncCalendarEventsForUser(userId)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to delete case" }, { status: 500 })
    }
}

export async function PUT(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const caseId = req.nextUrl.searchParams.get("caseId")
        const clientId = req.nextUrl.searchParams.get("clientId")
        if (caseId && clientId) {
            const caseFound = await Case.findById(caseId)
            const clientFound = await Client.findById(clientId)
            if (caseFound && clientFound) {
                caseFound.clients.push(clientId)
                clientFound.cases.push(caseId)
                await caseFound.save()
                await clientFound.save()
                return NextResponse.json({ success: true })
            }
        }
        return NextResponse.json({ success: false })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}
