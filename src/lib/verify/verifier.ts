import type { Analysis, TestResult } from "../types";
import { gradeLevel, MAX_GRADE } from "./readability";

/** Phrases that state or imply a diagnosis. */
const DIAGNOSIS = [
  /\byou (?:have|might have|may have|probably have|likely have|are suffering|suffer)\b/i,
  /\b(?:diagnos(?:is|ed|e)\s+(?:of|with|is))\b/i,
  /\bthis (?:confirms|proves|means you have)\b/i,
  /\b(?:the patient|he|she|they) (?:has|have) (?:a |an )?(?:disease|diabetes|anemia|anaemia|hepatitis|cancer|infection|hypo|hyper)/i,
  /\byou are (?:diabetic|anemic|anaemic)\b/i,
];

export interface Issue {
  id?: string;
  problem: string;
}

/** Every number the writer is allowed to use, from the engine output. */
export function allowedNumbers(a: Analysis): Set<string> {
  const nums = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return;
    nums.add(String(n));
    nums.add(String(Math.round(n)));
    nums.add(n.toLocaleString("en-US"));
  };
  for (const r of a.results) {
    add(r.value);
    add(r.converted?.value);
    add(r.range?.low);
    add(r.range?.high);
    add(r.range?.ageMin);
    add(r.range?.ageMax);
    add(r.urgent?.threshold);
    r.converted?.formula.match(/\d[\d.,]*/g)?.forEach((m) => nums.add(m.replace(/,/g, "")));
    r.rawValue.match(/\d[\d.,]*/g)?.forEach((m) => nums.add(m.replace(/,$/, "")));
  }
  add(a.age.value);
  for (let i = 0; i <= 10; i++) nums.add(String(i)); // "3 questions", "1 day"
  ["18", "24", "48"].forEach((n) => nums.add(n)); // hours / age words
  return nums;
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,(?=\d{3}\b)/g, "").replace(/,$/, ""));
}

export function findUnsupportedNumbers(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));
}

export function findDiagnosis(text: string): string | null {
  for (const re of DIAGNOSIS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** The text must not contradict the engine's status. */
export function contradicts(text: string, r: TestResult): boolean {
  const t = text.toLowerCase();
  // Remove negated mentions ("not in the normal range", "above the normal range") first.
  const positive = t.replace(/\b(?:not|outside(?: of)?|above|below|higher than|lower than|out of)\b[^.]{0,25}\bnormal\b/g, "");
  const says = {
    normal: /\b(?:in|within|inside) (?:the )?normal range\b|\b(?:is|are|looks|seems) (?:normal|fine|healthy|okay|ok)\b|\bnothing to worry\b/.test(positive),
    high: /\b(?:high|higher|above|elevated|raised)\b/.test(t),
    low: /\b(?:low|lower|below|reduced)\b/.test(t),
  };
  const s = r.rangeStatus;
  if (r.status === "normal") return /\b(?:too high|too low|above the normal|below the normal|abnormal|elevated)\b/.test(t);
  if (s === "high") return says.normal || (says.low && !says.high);
  if (s === "low") return says.normal || (says.high && !says.low);
  if (r.status === "urgent" || r.status === "abnormal") return says.normal;
  return false;
}

export interface Explanation {
  id: string;
  text: string;
  source: "ai" | "template";
  grade: number;
}

export interface Verification {
  passed: boolean;
  issues: Issue[];
  checks: { name: string; passed: boolean; detail: string }[];
}

export function termsToIgnore(a: Analysis): string[] {
  const terms = new Set<string>();
  for (const r of a.results) {
    [r.rawName, r.canonical, r.unit, r.range?.unit, r.converted?.unit].forEach((t) => t && terms.add(t));
  }
  ["hemoglobin", "platelets", "platelet", "cholesterol", "glucose", "thyroid", "aminotransferase", "alanine", "aspartate", "protein", "kidneys", "urine", "hormone", "oxygen", "infection", "medical", "doctor", "fasting", "liver", "muscles"].forEach((t) => terms.add(t));
  return [...terms];
}

export function verifyExplanations(a: Analysis, items: { id: string; text: string }[], questions: string[]): Verification {
  const allowed = allowedNumbers(a);
  const ignore = termsToIgnore(a);
  const issues: Issue[] = [];
  const ids = new Set(a.results.map((r) => r.id));

  for (const r of a.results) {
    if (!items.find((i) => i.id === r.id)) issues.push({ id: r.id, problem: `missing explanation for ${r.id}` });
  }
  for (const it of items) {
    const r = a.results.find((x) => x.id === it.id);
    if (!ids.has(it.id) || !r) {
      issues.push({ id: it.id, problem: `unknown test id ${it.id}` });
      continue;
    }
    const bad = findUnsupportedNumbers(it.text, allowed);
    if (bad.length) issues.push({ id: it.id, problem: `uses numbers not in the results: ${bad.join(", ")}` });
    const dx = findDiagnosis(it.text);
    if (dx) issues.push({ id: it.id, problem: `sounds like a diagnosis: "${dx}"` });
    if (contradicts(it.text, r)) issues.push({ id: it.id, problem: `contradicts the computed status (${r.status})` });
    const g = gradeLevel(it.text, ignore);
    if (g > MAX_GRADE) issues.push({ id: it.id, problem: `reading level is grade ${g}; must be ${MAX_GRADE} or below` });
  }
  questions.forEach((q, i) => {
    const dx = findDiagnosis(q);
    if (dx) issues.push({ id: `q${i}`, problem: `question sounds like a diagnosis: "${dx}"` });
    const bad = findUnsupportedNumbers(q, allowed);
    if (bad.length) issues.push({ id: `q${i}`, problem: `question uses numbers not in the results: ${bad.join(", ")}` });
  });
  const needQ = a.results.some((r) => r.status !== "normal");
  if (needQ && (questions.length < 3 || questions.length > 5)) issues.push({ problem: `needs 3 to 5 doctor questions, got ${questions.length}` });

  const has = (re: RegExp) => issues.some((i) => re.test(i.problem));
  const checks = [
    { name: "Numbers match the computed results", passed: !has(/numbers not in/), detail: "Every number in the text must come from the report or the range sheets." },
    { name: "No diagnosis", passed: !has(/diagnosis/), detail: "Lab safety rule 2: never state that the patient has a disease." },
    { name: "Agrees with the rule engine", passed: !has(/contradicts/), detail: "The text cannot call a high value normal, or the reverse." },
    { name: `Reading level ≤ class ${MAX_GRADE}`, passed: !has(/reading level/), detail: "Flesch-Kincaid grade, with test names and units excluded." },
    { name: "Covers every test, 3–5 questions", passed: !has(/missing explanation|needs 3 to 5|unknown test/), detail: "Each result gets an explanation; questions focus on results that are not normal." },
  ];
  return { passed: issues.length === 0, issues, checks };
}
