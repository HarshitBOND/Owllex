import { NextRequest, NextResponse } from "next/server"
import Client from "../../lib/models/client"
import User from "../../lib/models/user"
import connectMongoWithRetry from "../../lib/db/connectMongo"
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const { userId } = await auth();
        const userClients = await User.findOne( {clerkUid: userId} ).populate("clients")
        return NextResponse.json({ userClients })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        await connectMongoWithRetry()
        const { userId } = await auth();
        const clientData = await req.json()
        const client = new Client(clientData)
        await client.save()
        const userClients = await User.findOneAndUpdate( {clerkUid: userId}, { $push: { clients: client._id } }, { new: true } )
        return NextResponse.json({ userClients })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }
}

