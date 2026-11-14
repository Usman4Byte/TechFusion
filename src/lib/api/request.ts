import { z } from "zod";
import { NextResponse } from "next/server";
import { findReport, getCorpus } from "../data/corpus";
import { parseReport } from "../data/parseReport";
import type { Report } from "../types";

export const ReportInput = z
  .object({
    patientId: z.string().trim().max(40).optional(),
    reportText: z.string().max(200_000).optional(),
    age: z.coerce.number().int().min(0).max(130).optional().nullable(),
    sex: z.enum(["Male", "Female"]).optional().nullable(),
    useAI: z.boolean().optional(),
  })
  .refine((v) => v.patientId || v.reportText, { message: "Send a patientId or reportText" });

export type ReportInputT = z.infer<typeof ReportInput>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function resolveReport(input: ReportInputT): Report {
  if (input.reportText) {
    const r = parseReport(input.reportText, "uploaded-report");
    if (r.tests.length === 0) throw new ApiError(422, "No test results could be found in this report text.");
    return r;
  }
  const r = findReport(input.patientId!);
  if (!r) throw new ApiError(404, `No report found for patient ${input.patientId}.`);
  return r;
}

export function allReports(): Report[] {
  return getCorpus().reports;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request", details: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
