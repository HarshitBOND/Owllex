import { NextRequest, NextResponse } from "next/server"
import axios from 'axios';

const config = (skip: string, limit: string) => {
    return {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://provakil.com/api/v2/getBareActs?search=&skip=${skip}&limit=${limit}&searchAt=all`,
        headers: { 
            'Accept': 'application/json, text/plain, */*', 
            'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6,ar;q=0.5', 
            'Cache-Control': 'no-cache', 
            'Connection': 'keep-alive', 
            'Pragma': 'no-cache', 
            'Referer': 'https://provakil.com/home/showacts', 
            'Sec-Fetch-Dest': 'empty', 
            'Sec-Fetch-Mode': 'cors', 
            'Sec-Fetch-Site': 'same-origin', 
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 
            'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"', 
            'sec-ch-ua-mobile': '?1', 
            'sec-ch-ua-platform': '"Android"', 
            'Cookie': '_csrf=DA377VPqlDGx2Jb8MFA64bMu; pvsid=s%3An3Dw-OjkWhefu2D0KMrO34JnE5YlMFjy.jEr3pxQldyB6ubDHF1DDGpSDCLbAa1JefRnisYWvqxo'
        }
    }
}


export async function GET(request: NextRequest) {
    
    const skip = request.nextUrl.searchParams.get("skip") || "0";
    const limit = request.nextUrl.searchParams.get("limit") || "50";

    try {
        const response = await axios.request(config(skip, limit));
        return NextResponse.json(response.data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to fetch acts" }, { status: 500 });
    }
}
