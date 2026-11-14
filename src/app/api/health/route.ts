import { NextResponse } from "next/server";
import { getCorpus } from "@/lib/data/corpus";
import { anyProviderConfigured, providerStatus } from "@/lib/llm/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health: service status. Model details are never exposed publicly. */
export async function GET() {
  const { kb, reports } = getCorpus();
  return NextResponse.json({
    ok: true,
    corpus: { reports: reports.length, ranges: kb.ranges.length, urgentLimits: kb.critical.length, aliases: kb.aliases.length, safetyRules: kb.safety.length },
    assistant: anyProviderConfigured() && providerStatus().some((p) => p.configured && p.state !== "error") ? "online" : "fallback",
  });
}
