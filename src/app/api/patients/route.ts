import { NextResponse } from "next/server";
import { getCorpus } from "@/lib/data/corpus";

export const runtime = "nodejs";

/** GET /api/patients: report list for the picker (initials only, to limit exposure). */
export async function GET() {
  const { reports } = getCorpus();
  return NextResponse.json(
    reports.map((r) => ({
      id: r.patientId,
      initials: (r.name ?? "?").split(/\s+/).map((p) => p[0]).join("").toUpperCase(),
      tests: r.tests.length,
    })),
  );
}
