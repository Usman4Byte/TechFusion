import type { Demographic, RawTest, Report, Sex } from "../types";
import { cleanLines, parseNumber, stripMd, type Line } from "./text";

const QUALITATIVE = /^(negative|positive|trace|nil|absent|present|normal|abnormal|reactive|non-reactive|detected|not detected|\+{1,4}|[1-4]\+)$/i;

function field(lines: Line[], label: RegExp): { raw: string; line: number } | null {
  for (const l of lines) {
    const t = stripMd(l.text).replace(/^[-*•]\s*/, "");
    const m = t.match(new RegExp(`^(?:${label.source})\\s*[:=-]\\s*(.+)$`, "i"));
    if (m) return { raw: m[1].trim(), line: l.n };
  }
  return null;
}

function parseAge(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,3})(?:\s*(?:y|yr|yrs|years?))?$/i);
  return m ? Number(m[1]) : null;
}

function parseSex(raw: string | null): Sex | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (["male", "m", "man"].includes(t)) return "Male";
  if (["female", "f", "woman"].includes(t)) return "Female";
  return null;
}

/** Splits "13.5 g/dL" / "Negative" / "6,0 mmol/L" into value + unit. */
export function splitValue(rest: string): { value: number | null; textValue: string | null; unit: string | null } | null {
  const s = stripMd(rest).replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!s) return null;
  const m = s.match(/^([<>≤≥~]?=?\s*-?\d[\d.,]*(?:\s\d{3})*)\s*(.*)$/);
  if (m) {
    const value = parseNumber(m[1]);
    if (value === null) return null;
    const unit = m[2].trim() || null;
    if (unit && unit.split(/\s+/).length > 3) return null; // a sentence, not a unit
    return { value, textValue: null, unit };
  }
  const q = s.replace(/[.]$/, "");
  if (QUALITATIVE.test(q)) return { value: null, textValue: q[0].toUpperCase() + q.slice(1).toLowerCase(), unit: null };
  return null;
}

/** Extracts the analytical results from the results section of a report. */
function parseResults(lines: Line[], file: string): RawTest[] {
  const tests: RawTest[] = [];
  let pendingName: { name: string; line: number } | null = null;
  let tableHeaderSeen = false;

  for (const l of lines) {
    const text = l.text.trim();

    // Markdown table row
    if (text.startsWith("|")) {
      const cells = text.split("|").slice(1, -1).map((c) => stripMd(c));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!tableHeaderSeen && cells.some((c) => /^(test|test name|analyte|result|value|unit)$/i.test(c))) {
        tableHeaderSeen = true;
        continue;
      }
      if (cells.length >= 2) {
        const v = splitValue(cells.slice(1).join(" "));
        if (v) tests.push({ rawName: cells[0], rawValue: cells[1], ...v, unit: v.unit ?? (cells[2] || null), source: { file, line: l.n } });
      }
      continue;
    }

    const t = stripMd(text).replace(/^[-*•]\s*/, "");

    // Two-line format: "Test: AST" then "Result: 44 U/L"
    const nameOnly = t.match(/^(?:test conducted|test name|test|analyte|parameter)\s*:\s*(.+)$/i);
    if (nameOnly) {
      pendingName = { name: nameOnly[1].trim(), line: l.n };
      continue;
    }
    const valOnly = t.match(/^(?:value recorded|result|value|reading|measured value)\s*:\s*(.+)$/i);
    if (valOnly && pendingName) {
      const v = splitValue(valOnly[1]);
      if (v) tests.push({ rawName: pendingName.name, rawValue: valOnly[1].trim(), ...v, source: { file, line: l.n } });
      pendingName = null;
      continue;
    }

    // "Name: value unit", "Name -> value", "Name = value"
    const m = t.match(/^([A-Za-z][A-Za-z0-9 ()/.,'+-]{0,60}?)\s*(?::|->|=>|=|–|—)\s*(.+)$/);
    if (m) {
      const v = splitValue(m[2]);
      if (v) tests.push({ rawName: m[1].trim(), rawValue: m[2].trim(), ...v, source: { file, line: l.n } });
    }
  }
  return tests;
}

/** Parses one patient report (any of the corpus formats). */
export function parseReport(content: string, file = "pasted-report"): Report {
  const lines = cleanLines(content);

  const name = field(lines, /patient full name|patient name|name/);
  const ageF = field(lines, /recorded age|age/);
  const sexF = field(lines, /biological sex|sex|gender/);
  const mrnF = field(lines, /medical record number(?:\s*\(mrn\))?|mrn/);
  const issued = field(lines, /date of issuance|date/);

  const idFromMrn = mrnF?.raw.match(/P\d{2,}/i)?.[0]?.toUpperCase();
  const idFromFile = file.match(/P\d{2,}/i)?.[0]?.toUpperCase();

  // Results: lines after a "results" heading, else every non-demographic line.
  const resIdx = lines.findIndex((l) => /^#{1,6}.*(result|analytical|findings)/i.test(l.text));
  let resultLines = resIdx >= 0 ? lines.slice(resIdx + 1) : lines;
  const nextHead = resultLines.findIndex((l) => /^#{1,6}\s/.test(l.text));
  if (resIdx >= 0 && nextHead >= 0) resultLines = resultLines.slice(0, nextHead);
  const demoLines = new Set([name, ageF, sexF, mrnF, issued].filter(Boolean).map((f) => f!.line));
  resultLines = resultLines.filter((l) => !demoLines.has(l.n));

  const age: Demographic<number> = {
    value: parseAge(ageF?.raw ?? null),
    raw: ageF?.raw ?? null,
    source: ageF ? { file, line: ageF.line } : null,
  };
  const sex: Demographic<Sex> = {
    value: parseSex(sexF?.raw ?? null),
    raw: sexF?.raw ?? null,
    source: sexF ? { file, line: sexF.line } : null,
  };

  return {
    patientId: idFromMrn ?? idFromFile ?? "PASTED",
    name: name?.raw ?? null,
    mrn: mrnF?.raw ?? null,
    issued: issued?.raw ?? null,
    age,
    sex,
    tests: parseResults(resultLines, file),
    file,
  };
}
