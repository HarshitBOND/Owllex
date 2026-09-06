/**
 * Admin-only trigger for the Supreme Court judgment scraper
 * (backend/rag/scrapping/sources/sci-judgments/download.ts).
 *
 * The scraper drives a real, visible Chromium on this server so a human can
 * solve the site's captcha; this route just spawns it as a child process and
 * exposes its progress. It only makes sense when the Next.js server itself
 * runs somewhere a person can see that browser window (a local dev machine),
 * same as running the script from the terminal directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware";

const SCRAPER_SCRIPT = path.join(
  process.cwd(),
  "backend/rag/scrapping/sources/sci-judgments/download.ts"
);
const TSX_BIN = path.join(process.cwd(), "node_modules/.bin/tsx");
const MAX_COUNT = 200;
const MAX_LOG_LINES = 500;

type ScraperStatus = "starting" | "waiting_for_captcha" | "downloading" | "completed" | "failed";

interface ScraperJob {
  status: ScraperStatus;
  requested: number;
  downloaded: number;
  ingested: number;
  log: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// Single global job: only one visible browser window makes sense at a time.
let currentJob: ScraperJob | null = null;
let currentChild: ChildProcess | null = null;

function appendLog(job: ScraperJob, line: string) {
  job.log.push(line);
  if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
}

function handleLine(job: ScraperJob, line: string) {
  appendLog(job, line);
  if (line.includes("Solve the captcha")) {
    job.status = "waiting_for_captcha";
  } else if (line.includes("Results detected")) {
    job.status = "downloading";
  } else {
    const progress = line.match(/^\[(\d+)\/(\d+)\] Downloaded/);
    if (progress) {
      job.status = "downloading";
      job.downloaded = Number(progress[1]);
    } else if (line.startsWith("Added to knowledge base")) {
      job.ingested += 1;
    }
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  if (currentJob && !["completed", "failed"].includes(currentJob.status)) {
    return NextResponse.json(
      { success: false, error: "A scrape is already running", job: currentJob },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const requested = Number(body?.count);
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_COUNT) {
    return NextResponse.json(
      { success: false, error: `Enter a document count between 1 and ${MAX_COUNT}` },
      { status: 400 }
    );
  }

  const job: ScraperJob = {
    status: "starting",
    requested,
    downloaded: 0,
    ingested: 0,
    log: [],
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  currentJob = job;

  const child = spawn(TSX_BIN, [SCRAPER_SCRIPT, String(requested)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  currentChild = child;

  // A spawn failure (e.g. tsx missing because this is a deployed/production build
  // without devDependencies) surfaces as both an "error" event and then a "close"
  // event whose code is the raw negative errno (-2 for ENOENT) rather than a normal
  // exit code. Capture the real reason here so "close" doesn't overwrite it with
  // a bare "-2" that means nothing to whoever is looking at the job.
  let spawnFailureMessage: string | null = null;
  const NOT_LOCAL_MESSAGE =
    "Could not start the scraper (tsx not found). This tool spawns a real, human-visible " +
    "Chromium window to solve the site's captcha, so it only works on a local dev server " +
    "with devDependencies installed -- it cannot run on a deployed/production instance.";

  const onData = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim()) handleLine(job, line.trim());
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("close", (code) => {
    job.finishedAt = new Date().toISOString();
    if (code === 0 && !spawnFailureMessage) {
      job.status = "completed";
    } else {
      job.status = "failed";
      job.error = spawnFailureMessage ?? (code === -2 ? NOT_LOCAL_MESSAGE : `Scraper exited with code ${code}`);
    }
    currentChild = null;
    logAdminAction(admin.dbUserId, "sci_scraper_run", undefined, {
      targetType: "system",
      details: `SC judgment scraper ${job.status}: ${job.downloaded}/${job.requested} downloaded, ${job.ingested} added to knowledge base`,
    });
  });

  child.on("error", (err: NodeJS.ErrnoException) => {
    spawnFailureMessage = err.code === "ENOENT" ? NOT_LOCAL_MESSAGE : err.message;
    job.status = "failed";
    job.error = spawnFailureMessage;
    job.finishedAt = new Date().toISOString();
    currentChild = null;
  });

  return NextResponse.json({ success: true, job });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  return NextResponse.json({ success: true, job: currentJob });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  if (!currentChild || !currentJob || ["completed", "failed"].includes(currentJob.status)) {
    return NextResponse.json({ success: false, error: "No scrape is running" }, { status: 400 });
  }

  currentChild.kill();
  currentJob.status = "failed";
  currentJob.error = "Cancelled by admin";
  currentJob.finishedAt = new Date().toISOString();
  currentChild = null;

  return NextResponse.json({ success: true, job: currentJob });
}
