import { NextRequest, NextResponse } from "next/server"
import Case from "../../lib/models/case"
import User from "../../lib/models/user"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const { userId } = await auth();
        const userCases = await User.findOne( {clerkUid: userId} ).populate("cases")

        const caseId = req.nextUrl.searchParams.get("id")
        if (caseId) {
            const caseFound = await Case.findById(caseId)
            return NextResponse.json({ caseFound })
        }
        return NextResponse.json({ userCases })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}