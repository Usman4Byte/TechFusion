import type { Analysis, CriticalRow, EvidenceStep, KnowledgeBase, RangeRow, Report, Sex, Status, TestResult } from "../types";
import { normKey, round } from "../data/text";
import { resolveTestName } from "./aliases";
import { convert } from "./units";

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : String(n));
const where = (s?: { file: string; line: number } | null) => (s ? `${s.file}, line ${s.line}` : "");

function rangeLabel(r: RangeRow): string {
  const who = r.sex === "All" ? "all sexes" : r.sex.toLowerCase();
  const val = r.expectedText ?? `${fmt(r.low!)}–${fmt(r.high!)}${r.unit ? " " + r.unit : ""}`;
  return `${val} (${who}, age ${r.ageMin}–${r.ageMax})`;
}

function checkUrgent(
  value: number,
  unit: string | null,
  canonical: string,
  kb: KnowledgeBase,
  evidence: EvidenceStep[],
): CriticalRow | null {
  const row = kb.critical.find((c) => normKey(c.test) === normKey(canonical));
  if (!row) return null;
  const conv = convert(value, unit, row.unit, canonical);
  if (!conv.ok) {
    evidence.push({ label: "Urgent check skipped", detail: conv.reason, source: row.source });
    return null;
  }
  const v = conv.value;
  const hit = row.direction === "below"
    ? (kb.criticalRule.inclusive ? v <= row.threshold : v < row.threshold)
    : (kb.criticalRule.inclusive ? v >= row.threshold : v > row.threshold);
  const sign = row.direction === "below" ? (kb.criticalRule.inclusive ? "≤" : "<") : (kb.criticalRule.inclusive ? "≥" : ">");
  evidence.push({
    label: "Urgent check",
    detail: `${fmt(v)} ${row.unit} ${hit ? "meets" : "does not meet"} the urgent limit (${sign} ${fmt(row.threshold)} ${row.unit})`,
    source: row.source,
  });
  return hit ? row : null;
}

export function classifyTest(
  t: Report["tests"][number],
  idx: number,
  age: number | null,
  sex: Sex | null,
  kb: KnowledgeBase,
): TestResult {
  const evidence: EvidenceStep[] = [
    { label: "Read from report", detail: `${t.rawName}: ${t.rawValue}${t.unit && !t.rawValue.includes(t.unit) ? " " + t.unit : ""}`, source: t.source },
  ];
  const base = {
    id: `t${idx}`,
    rawName: t.rawName,
    rawValue: t.rawValue,
    value: t.value,
    textValue: t.textValue,
    unit: t.unit,
    source: t.source,
    evidence,
  };
  const fail = (status: Status, reason: string, extra: Partial<TestResult> = {}): TestResult => ({
    ...base,
    canonical: null,
    converted: null,
    range: null,
    rangeStatus: null,
    urgent: null,
    missing: [],
    ...extra,
    status,
    reason,
  });

  // 1. Name matching
  const match = resolveTestName(t.rawName, kb);
  if (!match) {
    evidence.push({ label: "Name match", detail: `"${t.rawName}" is not in the range sheets or glossary` });
    return fail("cannot_classify", "cannot be classified from the files: no matching test or range in the reference sheets");
  }
  const canonical = match.canonical;
  if (match.via !== "exact") {
    const how = match.via === "supplementary" ? "common report label (documented assumption)" : match.via;
    evidence.push({ label: "Name match", detail: `"${t.rawName}" = ${canonical} (${how})`, source: match.source });
  }

  // 2. Urgent check (does not depend on age/sex)
  const urgent = t.value !== null ? checkUrgent(t.value, t.unit, canonical, kb, evidence) : null;

  // 3. Range selection
  const rows = kb.ranges.filter((r) => normKey(r.test) === normKey(canonical));
  if (rows.length === 0) {
    evidence.push({ label: "Range lookup", detail: `No reference range for ${canonical} in the range sheets` });
    return fail(urgent ? "urgent" : "cannot_classify", "cannot be classified from the files: no reference range for this test", { canonical, urgent });
  }

  const missing: ("age" | "sex")[] = [];
  if (age === null) missing.push("age");
  if (sex === null && rows.some((r) => r.sex !== "All")) missing.push("sex");
  if (missing.length) {
    evidence.push({ label: "Range lookup", detail: `The right range depends on ${missing.join(" and ")}, which is missing. Not guessing.` });
    return fail(urgent ? "urgent" : "needs_info", `the right normal range cannot be chosen: ${missing.join(" and ")} missing`, { canonical, urgent, missing });
  }

  const fit = rows.filter((r) => (r.sex === "All" || r.sex === sex) && age! >= r.ageMin && age! <= r.ageMax);
  if (fit.length === 0) {
    evidence.push({ label: "Range lookup", detail: `No range for ${canonical} covers a ${age}-year-old ${sex ?? ""}`.trim() });
    return fail(urgent ? "urgent" : "cannot_classify", `cannot be classified from the files: no range for age ${age}`, { canonical, urgent });
  }
  // Prefer the most specific row (sex-specific over "All").
  const range = fit.sort((a, b) => (a.sex === "All" ? 1 : 0) - (b.sex === "All" ? 1 : 0))[0];
  evidence.push({ label: "Range chosen", detail: rangeLabel(range), source: range.source });

  // 4. Qualitative ranges
  if (range.expectedText) {
    if (t.textValue === null) {
      return fail("cannot_classify", "cannot be classified from the files: expected a word result", { canonical, range });
    }
    const ok = normKey(t.textValue) === normKey(range.expectedText);
    evidence.push({ label: "Compare", detail: `"${t.textValue}" ${ok ? "matches" : "does not match"} expected "${range.expectedText}"` });
    const rs = ok ? "normal" : "abnormal";
    return { ...base, canonical, converted: null, range, rangeStatus: rs, urgent, missing: [], status: urgent ? "urgent" : rs, reason: ok ? "matches the expected result" : `expected ${range.expectedText}` };
  }

  // 5. Numeric ranges (with unit conversion)
  if (t.value === null) {
    return fail("cannot_classify", "cannot be classified from the files: result is not a number", { canonical, range });
  }
  const conv = convert(t.value, t.unit, range.unit, canonical);
  if (!conv.ok) {
    evidence.push({ label: "Unit check", detail: conv.reason });
    return fail(urgent ? "urgent" : "cannot_classify", `cannot be classified from the files: ${conv.reason}`, { canonical, range, urgent });
  }
  const converted = conv.formula ? { value: conv.value, unit: range.unit!, formula: conv.formula } : null;
  if (conv.formula) evidence.push({ label: "Unit conversion", detail: `${conv.formula} (${conv.explain})` });

  const v = round(conv.value, 4);
  const low = range.low!;
  const high = range.high!;
  const inc = kb.boundaryRule.inclusive;
  let rs: "normal" | "low" | "high";
  if (inc ? v < low : v <= low) rs = "low";
  else if (inc ? v > high : v >= high) rs = "high";
  else rs = "normal";

  const onEdge = v === low || v === high;
  evidence.push({
    label: "Compare",
    detail: onEdge
      ? `${fmt(v)} is exactly on the limit, so it counts as NORMAL by the edge-case rule`
      : `${fmt(v)} is ${rs === "normal" ? "inside" : rs === "low" ? "below" : "above"} ${fmt(low)}–${fmt(high)}`,
    source: onEdge ? (kb.boundaryRule.source ?? undefined) : undefined,
  });

  const reason = urgent
    ? `urgent value: ${urgent.direction === "below" ? "at or below" : "at or above"} ${fmt(urgent.threshold)} ${urgent.unit}`
    : onEdge
      ? "exactly on the range limit, counted as normal"
      : rs === "normal"
        ? "inside the normal range"
        : `${rs === "low" ? "below" : "above"} the normal range`;

  return { ...base, canonical, converted, range, rangeStatus: rs, urgent, missing: [], status: urgent ? "urgent" : rs, reason };
}

export interface Overrides {
  age?: number | null;
  sex?: Sex | null;
}

export function analyze(report: Report, kb: KnowledgeBase, overrides: Overrides = {}): Analysis {
  const age = { ...report.age };
  const sex = { ...report.sex };
  if (age.value === null && overrides.age != null) Object.assign(age, { value: overrides.age, providedByUser: true });
  if (sex.value === null && overrides.sex) Object.assign(sex, { value: overrides.sex, providedByUser: true });

  const results = report.tests.map((t, i) => classifyTest(t, i, age.value, sex.value, kb));
  const summary = { normal: 0, low: 0, high: 0, abnormal: 0, urgent: 0, needs_info: 0, cannot_classify: 0 } as Record<Status, number>;
  results.forEach((r) => summary[r.status]++);
  const needsInfo = [...new Set(results.flatMap((r) => r.missing))];

  return { patientId: report.patientId, name: report.name, age, sex, results, needsInfo, hasUrgent: summary.urgent > 0, summary };
}

export { where as formatSource };
