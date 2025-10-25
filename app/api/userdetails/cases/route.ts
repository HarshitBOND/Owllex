import { NextRequest, NextResponse } from "next/server"
import CauseListCase from "../../lib/models/causelist-cases"
import Case from "../../lib/models/case"
import User from "../../lib/models/user"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server";
import axios from "axios";
import * as cheerio from "cheerio";
import Client from "../../lib/models/client"
import mongoose from "mongoose"


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
    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
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

    console.log(caseData)
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
        const userCases = await User.findOne( {clerkUid: userId} ).populate("cases")
        const caseId = req.nextUrl.searchParams.get("id")
        if (caseId) {
            const caseFound = await Case.findById(caseId).populate("notes").populate("clients")
            return NextResponse.json({ caseFound })
        }
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
        const caseData = await req.json()
        const user = await User.findOne( {clerkUid: userId} )
        const client = await Client.findById(caseData.client)
        const caseFound = await CauseListCase.findById(caseData.caseId)
        if (caseFound) {
            const {
                case_details: data,
                filing_details: filingDetails,
                listing_details: listingDetails,
                } = (await scrapeData(caseFound.links[1])) || { 
                case_details: {}, 
                filing_details: [], 
                listing_details: [] 
            };
            
            const formattedCase = {
                fileNo: caseData.fileNumber || Math.random().toString(36).substring(2, 9).toUpperCase(),
                caseNo: data?.["case_no"] || caseFound.case_no,
                cnrNo: data?.["cnr_no"],
                caseTitle: caseFound.case_title,
                advocate: caseFound.advocate,
                caseStage: caseFound.case_stage,
                remarks: caseFound.remarks,
                links: caseFound.links,
                documents: caseFound.documents,
                courtName: caseFound.court_name,
                courtValue: caseFound.court_value,
                courtRoom: caseFound.court_room,
                courtDate: caseFound.court_date,
                fillingAdvocate: data?.["filing_advocate"],
                fillingDate: data?.["date_of_filing"],
                status: data?.["status"],
                registrationDate: data?.["date_of_registration"],
                filingDetails:  filingDetails,
                listingDetails: listingDetails,
                notes: [],
                clients: [client._id],
            }

            const caseCreated = await Case.create(formattedCase)
            user.cases.push(caseCreated._id)
            client.cases.push(caseCreated._id)
            await user.save()
            await client.save()

            return NextResponse.json({ success: true })
        }
        return NextResponse.json({ success: false })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const caseId = req.nextUrl.searchParams.get("caseId")
        const clientId = req.nextUrl.searchParams.get("clientId")

        if (caseId && clientId) {
            const caseFound = await Case.findById(caseId)
            const clientFound = await Client.findById(clientId)
            if (caseFound && clientFound && caseFound.clients.filter((client: mongoose.Schema.Types.ObjectId) => client.toString() === clientId).length > 0) {
                caseFound.clients.pull(clientId)
                clientFound.cases.pull(caseId)
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
