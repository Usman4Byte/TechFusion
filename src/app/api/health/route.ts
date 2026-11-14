import { NextResponse } from "next/server";
import { getCorpus } from "@/lib/data/corpus";
import { providerStatus } from "@/lib/llm/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health: corpus + AI provider status (powers the status dot). */
export async function GET() {
  const { kb, reports } = getCorpus();
  return NextResponse.json({
    ok: true,
    corpus: { reports: reports.length, ranges: kb.ranges.length, urgentLimits: kb.critical.length, aliases: kb.aliases.length, safetyRules: kb.safety.length },
    providers: providerStatus(),
  });
}
