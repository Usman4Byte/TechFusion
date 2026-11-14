import { NextResponse } from "next/server";
import { z } from "zod";
import { getKnowledgeBase } from "@/lib/data/corpus";
import { analyze } from "@/lib/engine/classify";
import { answerQuestion } from "@/lib/chat/chat";
import { allReports, errorResponse, readJson, ReportInput, resolveReport } from "@/lib/api/request";

export const runtime = "nodejs";
export const maxDuration = 60;

const ChatInput = z.object({ question: z.string().trim().min(1).max(600) });

/** POST /api/chat: { patientId | reportText, age?, sex?, question } (locked to one patient). */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const input = ReportInput.parse(body);
    const { question } = ChatInput.parse(body);
    const report = resolveReport(input);
    const kb = getKnowledgeBase();
    const analysis = analyze(report, kb, { age: input.age ?? null, sex: input.sex ?? null });
    const result = await answerQuestion(question, report, analysis, allReports(), kb);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
