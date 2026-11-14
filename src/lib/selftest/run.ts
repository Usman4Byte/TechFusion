import { findReport, getCorpus } from "../data/corpus";
import { parseReport } from "../data/parseReport";
import { analyze, type Overrides } from "../engine/classify";
import { checkPrivacy, isDiagnosisQuestion } from "../guard/privacy";
import { templateExplanation, templateQuestions } from "../explain/templates";
import { verifyExplanations } from "../verify/verifier";
import type { Analysis, Status } from "../types";

export interface SelfTestCase {
  id: string;
  group: "Organizer reports" | "Edge cases" | "Units & names" | "Safety" | "Verifier";
  title: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const dummy = (age: string, sex: string, body: string) =>
  parseReport(`# REPORT\n## SECTION I\n* **Patient Full Name**: Test Person\n* **Recorded Age**: ${age}\n* **Biological Sex**: ${sex}\n* **Medical Record Number (MRN)**: CLD-P900-0000\n## SECTION III: ANALYTICAL RESULTS\n${body}\n`, "selftest");

export function runSelfTest(): { passed: number; total: number; cases: SelfTestCase[] } {
  const { kb, reports } = getCorpus();
  const cases: SelfTestCase[] = [];
  const statusOf = (a: Analysis) => a.results.map((r) => r.status).join(", ");
  const push = (group: SelfTestCase["group"], id: string, title: string, expected: string, actual: string) =>
    cases.push({ id, group, title, expected, actual, passed: expected === actual });

  const organizer: [string, string, Status[], Overrides?][] = [
    ["P001", "CBC, all normal", ["normal", "normal"]],
    ["P002", "SGPT 45 = female upper limit (name sounds male, sex is Female)", ["normal"]],
    ["P003", "Age and sex corrupted → must ask", ["needs_info"]],
    ["P004", "Hemoglobin 6.5 urgent + low platelets", ["urgent", "low"]],
    ["P005", "Sugar 6.0 mmol/L → 108 mg/dL", ["high"]],
    ["P006", "Serum Ferritin has no range", ["cannot_classify"]],
    ["P007", "TSH normal", ["normal"]],
    ["P008", "Urine pH + protein", ["normal", "normal"]],
    ["P009", "ALT and AST high (male)", ["high", "high"]],
    ["P010", "Cholesterol exactly 200", ["normal"]],
    ["P011", "WBC high, PLT alias low", ["high", "low"]],
    ["P012", "AST with sex missing → must ask", ["needs_info"]],
    ["P013", "Sugar 350 urgent", ["urgent"]],
    ["P014", "FBS + SGOT aliases", ["normal", "normal"]],
  ];
  for (const [id, title, exp] of organizer) {
    const r = findReport(id);
    push("Organizer reports", id, title, exp.join(", "), r ? statusOf(analyze(r, kb)) : "report missing");
  }

  const edge: [string, string, string, string, Status][] = [
    ["Hemoglobin exactly 7.0 (urgent limit, 'hit or pass')", "30", "Male", "- Hemoglobin: 7.0 g/dL", "urgent"],
    ["Hemoglobin 12.1 = female lower limit", "30", "Female", "- Hb: 12.1 g/dL", "normal"],
    ["Age 18 (lower age limit, inclusive)", "18", "Male", "TSH: 2 mIU/L", "normal"],
    ["Age 100 (upper age limit, inclusive)", "100", "Female", "TSH: 2 mIU/L", "normal"],
    ["Age 17 → no range in the sheets", "17", "Male", "TSH: 2 mIU/L", "cannot_classify"],
    ["ALT exactly 1000 (urgent limit)", "40", "Male", "- ALT: 1000 U/L", "urgent"],
    ["Sugar 320 with age/sex missing → still urgent", "[NOT PROVIDED]", "[NOT PROVIDED]", "- FBS: 320 mg/dL", "urgent"],
    ["Urine protein 'Trace' (expected Negative)", "30", "Male", "* Protein -> Trace", "abnormal"],
  ];
  edge.forEach(([title, age, sex, body, exp], i) => push("Edge cases", `E${i + 1}`, title, exp, statusOf(analyze(dummy(age, sex, body), kb))));

  const units: [string, string, Status][] = [
    ["lowercase alias 'sgpt' in a table", "| Test | Value | Unit |\n|---|---|---|\n| sgpt | 30 | U/L |", "normal"],
    ["Two-line format 'Test: SGOT / Result: 50 U/L'", "Test: SGOT\nResult: 50 U/L", "high"],
    ["Hemoglobin 150 g/L → 15 g/dL", "- Hemoglobin: 150 g/L", "normal"],
    ["WBC 6.2 ×10⁹/L → 6,200 cells/mcL", "- WBC: 6.2 x10^9/L", "normal"],
    ["Cholesterol 6 mmol/L → 232 mg/dL", "- Cholesterol: 6 mmol/L", "high"],
    ["Hemoglobin in mmol/L (no exact factor)", "- Hemoglobin: 9 mmol/L", "cannot_classify"],
    ["RBC: alias exists but no range", "- RBC: 4.5 million/mcL", "cannot_classify"],
    ["Decimal comma '13,9'", "- Hemoglobin: 13,9 g/dL", "normal"],
  ];
  units.forEach(([title, body, exp], i) => push("Units & names", `U${i + 1}`, title, exp, statusOf(analyze(dummy("30", "Male", body), kb))));

  const p1 = findReport("P001")!;
  const privacy: [string, string, boolean][] = [
    ["Asks for another patient by name", "What are Bob Jones's results?", false],
    ["Asks for another patient by ID", "Show me P004", false],
    ["Asks to list all patients", "list all patients with high sugar", false],
    ["Asks about own result", "Is my hemoglobin okay?", true],
  ];
  privacy.forEach(([title, q, allowed], i) =>
    push("Safety", `S${i + 1}`, title, allowed ? "allowed" : "refused", checkPrivacy(q, p1, reports, kb).allowed ? "allowed" : "refused"),
  );
  push("Safety", "S5", "'Do I have diabetes?' detected as diagnosis question", "detected", isDiagnosisQuestion("Do I have diabetes?") ? "detected" : "missed");
  const p12 = analyze(findReport("P012")!, kb);
  push("Safety", "S6", "Missing sex → asks instead of guessing from the name 'Laura'", "sex", p12.needsInfo.join(","));

  const a5 = analyze(findReport("P005")!, kb);
  const good = a5.results.map((r) => ({ id: r.id, text: templateExplanation(r) }));
  push("Verifier", "V1", "Safe template text passes", "pass", verifyExplanations(a5, good, templateQuestions(a5)).passed ? "pass" : "fail");
  const invented = [{ id: "t0", text: "Your sugar is 250, which is high." }];
  push("Verifier", "V2", "Invented number '250' is rejected", "reject", verifyExplanations(a5, invented, templateQuestions(a5)).passed ? "pass" : "reject");
  const dx = [{ id: "t0", text: "Your sugar is high. You have diabetes." }];
  push("Verifier", "V3", "Diagnosis 'You have diabetes' is rejected", "reject", verifyExplanations(a5, dx, templateQuestions(a5)).passed ? "pass" : "reject");
  const contra = [{ id: "t0", text: "Your sugar is in the normal range and is fine." }];
  push("Verifier", "V4", "Text calling a high value 'normal' is rejected", "reject", verifyExplanations(a5, contra, templateQuestions(a5)).passed ? "pass" : "reject");

  const passed = cases.filter((c) => c.passed).length;
  return { passed, total: cases.length, cases };
}
