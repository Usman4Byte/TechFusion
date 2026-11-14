import { NextResponse } from "next/server";
import { getKnowledgeBase } from "@/lib/data/corpus";
import { analyze } from "@/lib/engine/classify";
import { explain } from "@/lib/explain/explain";
import { errorResponse, readJson, ReportInput, resolveReport } from "@/lib/api/request";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/analyze
 * Body: { patientId: "P001" } or { reportText: "...", age?, sex?, useAI? }
 * Returns the deterministic classification + verified plain-language explanation.
 */
export async function POST(req: Request) {
  try {
    const input = ReportInput.parse(await readJson(req));
    const report = resolveReport(input);
    const kb = getKnowledgeBase();
    const analysis = analyze(report, kb, { age: input.age ?? null, sex: input.sex ?? null });
    const explanation = await explain(analysis, { useAI: input.useAI });

    return NextResponse.json({
      patient: { id: report.patientId, name: report.name, mrn: report.mrn, issued: report.issued, age: analysis.age, sex: analysis.sex },
      needsInfo: analysis.needsInfo,
      hasUrgent: analysis.hasUrgent,
      summary: analysis.summary,
      results: analysis.results,
      explanation,
      safetyNote: "This explains the numbers only. It is not a diagnosis. Only a licensed doctor can diagnose a condition.",
      rules: { boundary: kb.boundaryRule, critical: kb.criticalRule },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
