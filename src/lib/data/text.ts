/** Shared text helpers for parsing the lab corpus. */

/** Lines longer than this are boilerplate paragraphs (legal, QA, HIPAA…). */
export const NOISE_LINE_LENGTH = 400;

export interface Line {
  n: number; // 1-based line number in the original file
  text: string;
}

/**
 * Removes boilerplate: long paragraphs and everything inside "APPENDIX"
 * sections. Keeps original line numbers so every fact stays citable.
 */
export function cleanLines(content: string): Line[] {
  const out: Line[] = [];
  let inAppendix = false;
  content.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.replace(/\s+$/, "");
    if (/^#{1,6}\s/.test(text)) {
      inAppendix = /appendix/i.test(text);
      if (inAppendix) return;
    }
    if (inAppendix) return;
    if (!text.trim()) return;
    if (text.length >= NOISE_LINE_LENGTH) return;
    out.push({ n: i + 1, text });
  });
  return out;
}

/** A patient report has a patient-name field outside the boilerplate. */
export function isPatientReport(content: string): boolean {
  return cleanLines(content).some((l) => /patient (full )?name\**\s*:/i.test(l.text));
}

/** "Platelet Count (PLT)" -> "plateletcountplt" style key without brackets content. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

/**
 * Parses numbers such as "13.5", "13,5" (decimal comma), "120,000" / "120 000"
 * (thousands), "< 7". Returns null if not a number.
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/^[<>≤≥~]=?\s*/, "");
  if (!/^-?\d[\d.,\s]*$/.test(s)) return null;
  s = s.replace(/\s+/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normalises a unit for comparison: "cells/µL" == "cells/mcL", case-insensitive. */
export function normUnit(u: string | null | undefined): string {
  if (!u) return "";
  return u
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/µ|μ/g, "mc")
    .replace(/\/ul$/, "/mcl")
    .replace(/^iu\/l$/, "u/l")
    .replace(/^miu\/l$/, "miu/l");
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
