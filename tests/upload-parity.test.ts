import { describe, expect, it } from "vitest";
import { CORPUS } from "../src/lib/data/corpus.generated";
import { findReport, getCorpus } from "../src/lib/data/corpus";
import { analyze } from "../src/lib/engine/classify";
import { resolveReport } from "../src/lib/api/request";
import { isPatientReport } from "../src/lib/data/text";
import { checkPrivacy } from "../src/lib/guard/privacy";

/** An uploaded report must give exactly the same results as the built-in one. */
describe("uploaded report = built-in report", () => {
  const { kb, reports } = getCorpus();
  const files = CORPUS.filter((f) => isPatientReport(f.content));

  it.each(files.map((f) => [f.name, f] as const))("%s", (_name, f) => {
    const uploaded = resolveReport({ reportText: f.content, fileName: f.name });
    const builtIn = findReport(uploaded.patientId)!;
    expect(builtIn, "patient id from the MRN").toBeDefined();
    expect(uploaded).toEqual(builtIn);
    expect(analyze(uploaded, kb)).toEqual(analyze(builtIn, kb));
  });

  it("works with Windows or Unix line endings and a different file name", () => {
    const f = files[3];
    const unix = resolveReport({ reportText: f.content.replace(/\r\n/g, "\n"), fileName: "my report.md" });
    const builtIn = findReport(unix.patientId)!;
    expect(analyze(unix, kb).results.map((r) => [r.status, r.converted, r.range?.low, r.range?.high])).toEqual(
      analyze(builtIn, kb).results.map((r) => [r.status, r.converted, r.range?.low, r.range?.high]),
    );
  });

  it("privacy lock applies to uploaded reports too", () => {
    const up = resolveReport({ reportText: files[0].content, fileName: files[0].name });
    expect(checkPrivacy("What are Bob Jones's results?", up, reports, kb).allowed).toBe(false);
    expect(checkPrivacy("Is my hemoglobin okay?", up, reports, kb).allowed).toBe(true);
  });
});
