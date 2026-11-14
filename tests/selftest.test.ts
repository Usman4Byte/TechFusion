import { describe, expect, it } from "vitest";
import { runSelfTest } from "../src/lib/selftest/run";
import { gradeLevel } from "../src/lib/verify/readability";
import { explain } from "../src/lib/explain/explain";
import { analyze } from "../src/lib/engine/classify";
import { findReport, getCorpus } from "../src/lib/data/corpus";
import { answerQuestion } from "../src/lib/chat/chat";

describe("self-test suite", () => {
  const res = runSelfTest();
  it.each(res.cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(c.actual, c.title).toBe(c.expected);
  });
});

describe("no-AI fallback", () => {
  it("explains every result with templates that pass the verifier", async () => {
    const { kb } = getCorpus();
    for (const r of getCorpus().reports) {
      const ex = await explain(analyze(r, kb), { useAI: false });
      expect(ex.explanations.length).toBe(r.tests.length);
      const failing = ex.verification.issues.filter((i) => !/reading level/.test(i.problem));
      expect(failing, r.patientId).toEqual([]);
    }
  });
  it("urgent report gets a see-a-doctor-today warning", async () => {
    const { kb } = getCorpus();
    const ex = await explain(analyze(findReport("P013")!, kb), { useAI: false });
    expect(ex.urgentWarning).toMatch(/see a doctor today/i);
  });
  it("chat refuses other patients and answers own questions without AI", async () => {
    const { kb, reports } = getCorpus();
    const r = findReport("P009")!;
    const a = analyze(r, kb);
    expect((await answerQuestion("What about Alice Smith?", r, a, reports, kb)).kind).toBe("refused");
    const own = await answerQuestion("Why is my ALT high?", r, a, reports, kb);
    expect(own.kind).toBe("answer");
    expect(own.answer).toMatch(/ALT/);
  });
});

describe("readability", () => {
  it("scores simple text low", () => {
    expect(gradeLevel("Your result is fine. It is in the normal range.")).toBeLessThanOrEqual(8);
  });
});
