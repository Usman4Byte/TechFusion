import type { Analysis, TestResult } from "../types";
import { infoFor } from "./testInfo";

const n = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : String(v));

/** Deterministic, always-safe explanation for one result (no AI needed). */
export function templateExplanation(r: TestResult): string {
  const info = infoFor(r.canonical);
  const name = r.canonical ?? r.rawName;
  const parts: string[] = [];
  if (info) parts.push(info.measures);

  const shown = r.converted ? `${n(r.converted.value)} ${r.converted.unit}` : `${r.rawValue}${r.unit && !r.rawValue.includes(r.unit) ? " " + r.unit : ""}`;
  const range = r.range ? (r.range.expectedText ?? `${n(r.range.low!)} to ${n(r.range.high!)}${r.range.unit ? " " + r.range.unit : ""}`) : null;

  switch (r.status) {
    case "normal":
      parts.push(`Your result is ${shown}. The normal range is ${range}, so this result is in the normal range.`);
      break;
    case "low":
    case "high":
      parts.push(`Your result is ${shown}. The normal range is ${range}, so this result is ${r.status === "low" ? "below" : "above"} the normal range.`);
      if (info) parts.push(r.status === "low" ? info.low : info.high);
      break;
    case "abnormal":
      parts.push(`Your result is "${r.textValue}". The expected result is "${range}", so this result is not the usual one.`);
      if (info?.high) parts.push(info.high);
      break;
    case "urgent":
      parts.push(`Your result is ${shown}. This is at a level the lab marks as urgent.`);
      if (info && r.rangeStatus) parts.push(r.rangeStatus === "low" ? info.low : info.high);
      parts.push("Please see a doctor today.");
      break;
    case "needs_info":
      parts.push(`Your result is ${shown}. The normal range for ${name} depends on your ${r.missing.join(" and ")}, which is missing from the report. Please tell us your ${r.missing.join(" and ")} so we can choose the right range.`);
      break;
    case "cannot_classify":
      parts.push(`Your result is ${shown}. This cannot be classified from the files: ${r.reason.replace(/^cannot be classified from the files:\s*/, "")}. Please ask your doctor about it.`);
      break;
  }
  return parts.filter(Boolean).join(" ");
}

/** Deterministic doctor questions built from the non-normal results. */
export function templateQuestions(a: Analysis): string[] {
  const qs: string[] = [];
  for (const r of a.results) {
    const name = r.canonical ?? r.rawName;
    if (r.status === "urgent") qs.push(`My ${name} result is marked urgent. What should I do today?`);
    else if (r.status === "high" || r.status === "low") qs.push(`My ${name} is ${r.status === "high" ? "above" : "below"} the normal range. What could be causing this?`);
    else if (r.status === "abnormal") qs.push(`My ${name} result was "${r.textValue}". What does this mean for me?`);
    else if (r.status === "cannot_classify") qs.push(`The lab could not classify my ${name} result. Can you explain it to me?`);
    else if (r.status === "needs_info") qs.push(`Which normal range for ${name} applies to me?`);
  }
  const extra = [
    "Do I need to repeat any of these tests, and when?",
    "Are there changes in food, sleep or exercise that could help my results?",
    "Could any of my medicines affect these results?",
  ];
  for (const q of extra) if (qs.length < 3) qs.push(q);
  return qs.slice(0, 5);
}
