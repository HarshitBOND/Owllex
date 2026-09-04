/**
 * Diagnoses why MongoDB is or isn't reachable from wherever this runs.
 *
 *   npm run db:doctor
 *
 * Atlas silently drops packets from IPs that are not on a cluster's Network Access
 * list, which looks identical to a dead network from the client side. This walks
 * the layers -- egress IP, DNS, raw TCP, driver handshake -- so the failing one is
 * obvious, and prints the exact IP to allowlist when that is the problem.
 */

import dns from "node:dns/promises"
import net from "node:net"
import mongoose from "mongoose"

const URI = process.env.MONGODB_URI
const DB = process.env.MONGODB_DB || "LexVert"
const TCP_TIMEOUT_MS = 8000

const ok = (s: string) => `  \x1b[32mOK\x1b[0m   ${s}`
const bad = (s: string) => `  \x1b[31mFAIL\x1b[0m ${s}`

const probeTcp = (host: string, port: number) =>
  new Promise<{ open: boolean; ms: number; err?: string }>((resolve) => {
    const started = Date.now()
    const socket = new net.Socket()
    const done = (open: boolean, err?: string) => {
      socket.destroy()
      resolve({ open, ms: Date.now() - started, err })
    }
    socket.setTimeout(TCP_TIMEOUT_MS)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false, "timed out (packets dropped, no refusal)"))
    socket.once("error", (e: NodeJS.ErrnoException) => done(false, e.code || e.message))
    socket.connect(port, host)
  })

/**
 * Asks an external service to open the same TCP connection from other networks.
 * If the world can reach the cluster but we cannot, the cluster and its Network
 * Access list are fine and the problem is this machine's route to MongoDB.
 */
const reachableFromOutside = async (ip: string) => {
  try {
    const start = await fetch(
      `https://check-host.net/check-tcp?host=${ip}:27017&max_nodes=5`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) },
    )
    const { request_id: id } = (await start.json()) as { request_id?: string }
    if (!id) return null
    await new Promise((r) => setTimeout(r, 12000))
    const res = await fetch(`https://check-host.net/check-result/${id}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })
    const body = (await res.json()) as Record<string, Array<{ time?: number; error?: string }> | null>
    const done = Object.values(body).filter(Boolean) as Array<Array<{ time?: number; error?: string }>>
    const connected = done.filter((n) => typeof n[0]?.time === "number").length
    return { connected, total: done.length }
  } catch {
    return null
  }
}

const egressIp = async () => {
  for (const url of ["https://api.ipify.org", "https://icanhazip.com"]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.ok) return (await res.text()).trim()
    } catch {
      // try the next service
    }
  }
  return null
}

async function main() {
  console.log("\nMongoDB connectivity check\n" + "=".repeat(60))

  if (!URI) {
    console.log(bad("MONGODB_URI is not set. Load your env file first."))
    process.exit(1)
  }

  const hostPart = URI.match(/@([^/?]+)/)?.[1]
  const isSrv = URI.startsWith("mongodb+srv://")
  console.log(`\ncluster: ${hostPart}   db: ${DB}\n`)

  // 1. Who does the outside world think we are?
  console.log("1. Egress IP")
  const ip = await egressIp()
  console.log(ip ? ok(`this machine reaches the internet as ${ip}`) : bad("could not determine egress IP"))

  // 2. Can we still reach anything at all on a non-HTTP port?
  console.log("\n2. General outbound connectivity (control)")
  const control = await probeTcp("1.1.1.1", 53)
  console.log(
    control.open
      ? ok(`1.1.1.1:53 reachable in ${control.ms}ms -- outbound ports are not blocked here`)
      : bad(`1.1.1.1:53 ${control.err} -- this machine has a general network problem`),
  )

  // 3. DNS
  console.log("\n3. DNS")
  let nodes: string[] = []
  try {
    if (isSrv && hostPart) {
      const srv = await dns.resolveSrv(`_mongodb._tcp.${hostPart}`)
      nodes = srv.map((r) => r.name)
      console.log(ok(`SRV resolved to ${nodes.length} node(s)`))
    } else if (hostPart) {
      nodes = hostPart.split(",").map((h) => h.split(":")[0])
    }
  } catch (e: any) {
    console.log(bad(`SRV lookup failed: ${e.code || e.message}`))
  }

  // 4. Raw TCP to each replica set member
  console.log("\n4. TCP reachability to the cluster (port 27017)")
  const results: { open: boolean }[] = []
  const nodeIps: string[] = []
  for (const node of nodes) {
    let addr = node
    try {
      addr = (await dns.resolve4(node))[0]
    } catch {
      // fall back to the hostname
    }
    nodeIps.push(addr)
    const r = await probeTcp(addr, 27017)
    results.push(r)
    console.log(r.open ? ok(`${node} (${addr}) ${r.ms}ms`) : bad(`${node} (${addr}) ${r.err} after ${r.ms}ms`))
  }
  const allDropped = results.length > 0 && results.every((r) => !r.open)

  // 5. Real driver handshake
  console.log("\n5. Driver handshake")
  let connectError: string | null = null
  try {
    await mongoose.connect(URI, { dbName: DB, serverSelectionTimeoutMS: 8000, bufferCommands: false })
    const admin = mongoose.connection.db!.admin()
    const { version } = await admin.serverInfo()
    console.log(ok(`connected and authenticated (MongoDB ${version})`))
    await mongoose.disconnect()
  } catch (e: any) {
    connectError = e.message
    console.log(bad(e.message.split("\n")[0]))
  }

  // Verdict
  console.log("\n" + "=".repeat(60))
  if (!connectError) {
    console.log("VERDICT: MongoDB is reachable from here. Nothing to fix.\n")
    process.exit(0)
  }
  if (!control.open) {
    console.log("VERDICT: this machine has no working outbound network, so MongoDB is\n" +
      "the symptom, not the cause. Fix networking first.\n")
  } else if (allDropped) {
    // Distinguish "the cluster is refusing us" from "the cluster is fine and this
    // machine's route to it is broken" -- both look identical from here.
    console.log("checking whether the cluster answers other networks...")
    const outside = await reachableFromOutside(nodeIps[0])

    if (outside && outside.connected > 0) {
      console.log(
        `\nVERDICT: the cluster is UP -- ${outside.connected}/${outside.total} external probe nodes\n` +
        "completed a TCP handshake to it just now. Our packets are dropped before\n" +
        `they get there, so this is the route from this machine (${ip}) to MongoDB's\n` +
        "network. Not the code, not the credentials, and not the Network Access list\n" +
        "(an allowlist rejection cannot be fixed by adding 0.0.0.0/0; this is not that).\n\n" +
        "FIX: get a different egress IP.\n" +
        "     - In a Codespace: stop and restart it, or delete and recreate it. A\n" +
        "       rebuild of the container alone keeps the same VM and the same IP.\n" +
        "     - Then re-run: npm run db:doctor\n" +
        "     - If a new IP is still dropped, run the app from a network that can\n" +
        "       reach the cluster (your own machine) while this one is blocked.\n",
      )
    } else {
      console.log(
        "\nVERDICT: every cluster node drops our packets on 27017, and external probe\n" +
        "nodes could not reach it either. Either the cluster is paused/down, or the\n" +
        "Network Access list is rejecting traffic.\n\n" +
        "FIX: check the cluster is not paused in the Atlas UI, then confirm\n" +
        `     Network Access contains ${ip || "this machine's egress IP"} or 0.0.0.0/0.\n`,
      )
    }
  } else if (/authentication failed|bad auth/i.test(connectError)) {
    console.log("VERDICT: the network is fine and the cluster answered -- the credentials\n" +
      "in MONGODB_URI are wrong or the database user was removed.\n")
  } else {
    console.log(`VERDICT: reached the cluster but the handshake failed: ${connectError}\n`)
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
