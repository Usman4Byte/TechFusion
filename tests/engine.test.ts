import { describe, expect, it } from "vitest";
import { getCorpus, findReport } from "../src/lib/data/corpus";
import { analyze } from "../src/lib/engine/classify";
import { parseReport } from "../src/lib/data/parseReport";
import { parseNumber } from "../src/lib/data/text";

const { kb, reports } = getCorpus();

function statuses(id: string, overrides = {}) {
  const r = findReport(id)!;
  expect(r, `report ${id}`).toBeDefined();
  return analyze(r, kb, overrides).results.map((t) => `${t.canonical ?? t.rawName}:${t.status}`);
}

describe("knowledge base", () => {
  it("parses every reference sheet", () => {
    expect(kb.ranges.length).toBe(13);
    expect(kb.critical.length).toBe(4);
    expect(kb.safety.length).toBe(4);
    expect(kb.aliases.find((a) => a.alias === "SGPT")?.canonical).toBe("ALT");
    expect(kb.boundaryRule.source?.file).toContain("hematology");
  });
  it("finds all 14 reports", () => {
    expect(reports.length).toBe(14);
  });
});

describe("answer key (organizer reports)", () => {
  const cases: [string, string[]][] = [
    ["P001", ["Hemoglobin:normal", "White Blood Cell Count:normal"]],
    ["P002", ["ALT:normal"]], // SGPT 45, female limit 45 -> boundary normal
    ["P003", ["Fasting Blood Sugar:needs_info"]],
    ["P004", ["Hemoglobin:urgent", "Platelet Count:low"]],
    ["P005", ["Fasting Blood Sugar:high"]], // 6.0 mmol/L = 108 mg/dL
    ["P006", ["Serum Ferritin:cannot_classify"]],
    ["P007", ["TSH:normal"]],
    ["P008", ["Urine pH:normal", "Urine Protein:normal"]],
    ["P009", ["ALT:high", "AST:high"]],
    ["P010", ["Cholesterol:normal"]], // exactly 200
    ["P011", ["White Blood Cell Count:high", "Platelet Count:low"]],
    ["P012", ["AST:needs_info"]],
    ["P013", ["Fasting Blood Sugar:urgent"]],
    ["P014", ["Fasting Blood Sugar:normal", "AST:normal"]],
  ];
  it.each(cases)("%s", (id, expected) => {
    expect(statuses(id)).toEqual(expected);
  });

  it("P005 shows the conversion", () => {
    const r = analyze(findReport("P005")!, kb).results[0];
    expect(r.converted?.value).toBe(108);
    expect(r.converted?.formula).toContain("× 18");
  });
  it("P012 asks for sex only; works once provided", () => {
    const a = analyze(findReport("P012")!, kb);
    expect(a.needsInfo).toEqual(["sex"]);
    expect(statuses("P012", { sex: "Female" })).toEqual(["AST:high"]); // 44 > 43
    expect(statuses("P012", { sex: "Male" })).toEqual(["AST:normal"]);
  });
  it("P003 asks for age and sex; never guesses", () => {
    expect(analyze(findReport("P003")!, kb).needsInfo).toEqual(["age", "sex"]);
    expect(statuses("P003", { age: 40 })).toEqual(["Fasting Blood Sugar:needs_info"]);
    expect(statuses("P003", { age: 40, sex: "Male" })).toEqual(["Fasting Blood Sugar:high"]);
  });
  it("age on a shared band boundary uses the band that ends there (upper bound inclusive)", () => {
    const src = { file: "test", line: 1 };
    const kb2 = {
      ...kb,
      ranges: [
        ...kb.ranges,
        { test: "TSH", sex: "All" as const, ageMin: 101, ageMax: 120, low: 1, high: 2, expectedText: null, unit: "mIU/L", source: src },
        { test: "TSH", sex: "All" as const, ageMin: 120, ageMax: 130, low: 5, high: 6, expectedText: null, unit: "mIU/L", source: src },
      ],
    };
    const at = (age: string) => analyze(parseReport(mk(age, "Male", "TSH: 1.5 mIU/L")), kb2).results[0];
    expect(at("120").range?.ageMax).toBe(120); // boundary age -> lower band (upper bound inclusive)
    expect(at("120").status).toBe("normal");
    expect(at("125").range?.ageMin).toBe(120);
    expect(at("125").status).toBe("low");
  });
});

const mk = (age: string, sex: string, body: string) =>
  `# CITYLAB DIAGNOSTICS - COMPREHENSIVE ANALYTICAL REPORT\n## SECTION I\n* **Patient Full Name**: Test Person\n* **Recorded Age**: ${age}\n* **Biological Sex**: ${sex}\n* **Medical Record Number (MRN)**: CLD-P900-0000\n## SECTION III: ANALYTICAL RESULTS\n${body}\n`;
const one = (age: string, sex: string, body: string) => analyze(parseReport(mk(age, sex, body)), kb).results.map((r) => r.status);

describe("edge cases (dummy reports)", () => {
  it("urgent threshold is inclusive (hit or pass)", () => {
    expect(one("30", "Male", "- Hemoglobin: 7.0 g/dL")).toEqual(["urgent"]);
    expect(one("30", "Male", "- Hemoglobin: 7.1 g/dL")).toEqual(["low"]);
    expect(one("30", "Male", "- ALT: 1000 U/L")).toEqual(["urgent"]);
  });
  it("exact range limits are normal", () => {
    expect(one("30", "Female", "- Hb: 12.1 g/dL")).toEqual(["normal"]);
    expect(one("30", "Female", "- Hb: 15.1 g/dL")).toEqual(["normal"]);
    expect(one("30", "Female", "- Hb: 15.2 g/dL")).toEqual(["high"]);
  });
  it("age bands are inclusive; outside = cannot classify", () => {
    expect(one("18", "Male", "TSH: 2 mIU/L")).toEqual(["normal"]);
    expect(one("100", "Male", "TSH: 2 mIU/L")).toEqual(["normal"]);
    expect(one("17", "Male", "TSH: 2 mIU/L")).toEqual(["cannot_classify"]);
    expect(one("101", "Male", "TSH: 2 mIU/L")).toEqual(["cannot_classify"]);
  });
  it("matches aliases in any case/format", () => {
    expect(one("30", "Male", "| Test | Value | Unit |\n|---|---|---|\n| sgpt | 30 | U/L |")).toEqual(["normal"]);
    expect(one("30", "Male", "Test: SGOT\nResult: 50 U/L")).toEqual(["high"]);
    expect(one("30", "Male", "* PLT -> 40000 cells/mcL")).toEqual(["urgent"]);
  });
  it("converts exact units, refuses unknown ones", () => {
    expect(one("30", "Male", "- Hemoglobin: 150 g/L")).toEqual(["normal"]);
    expect(one("30", "Male", "- WBC: 6.2 x10^9/L")).toEqual(["normal"]);
    expect(one("30", "Male", "- Cholesterol: 6 mmol/L")).toEqual(["high"]);
    expect(one("30", "Male", "- Hemoglobin: 9 mmol/L")).toEqual(["cannot_classify"]);
  });
  it("unknown tests and aliases without ranges are not classified", () => {
    expect(one("30", "Male", "- Vitamin D: 20 ng/mL")).toEqual(["cannot_classify"]);
    expect(one("30", "Male", "- RBC: 4.5 million/mcL")).toEqual(["cannot_classify"]);
  });
  it("urgent still fires when demographics are missing", () => {
    expect(one("[NOT PROVIDED]", "[NOT PROVIDED]", "- FBS: 320 mg/dL")).toEqual(["urgent"]);
  });
  it("qualitative urine results", () => {
    expect(one("30", "Male", "* Protein -> Trace")).toEqual(["abnormal"]);
  });
  it("parses messy numbers", () => {
    expect(parseNumber("13,5")).toBe(13.5);
    expect(parseNumber("120,000")).toBe(120000);
    expect(parseNumber("abc")).toBeNull();
  });
});
