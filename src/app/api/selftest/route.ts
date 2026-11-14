import { NextResponse } from "next/server";
import { runSelfTest } from "@/lib/selftest/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/selftest: runs every built-in tricky case live. */
export async function GET() {
  return NextResponse.json(runSelfTest());
}
