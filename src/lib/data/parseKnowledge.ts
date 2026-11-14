import type { AliasRow, CriticalRow, KnowledgeBase, RangeRow, SafetyRule, Sex } from "../types";
import { cleanLines, isPatientReport, normKey, parseNumber, stripMd, type Line } from "./text";

export interface CorpusFile {
  name: string;
  content: string;
}

/** "Hemoglobin (Hb)" -> { name: "Hemoglobin", alias: "Hb" } */
function splitParen(name: string): { name: string; alias: string | null } {
  const m = stripMd(name).match(/^(.*?)\s*\((.+?)\)\s*$/);
  return m ? { name: m[1].trim(), alias: m[2].trim() } : { name: stripMd(name), alias: null };
}

function parseSexWord(s: string): Sex | "All" {
  const t = s.toLowerCase();
  if (/\bfemale\b/.test(t)) return "Female";
  if (/\bmale\b/.test(t)) return "Male";
  return "All";
}

/** Parses "13.8 - 17.2 g/dL" or "Negative" (+ optional trailing unit). */
function parseLimits(s: string): { low: number | null; high: number | null; expectedText: string | null; unit: string | null } | null {
  const t = stripMd(s).replace(/\(.*?\)/g, "").replace(/\.\s*$/, "").trim();
  const m = t.match(/^([\d.,]+)\s*(?:-|–|to)\s*([\d.,]+)\s*(.*)$/i);
  if (m) {
    const low = parseNumber(m[1]);
    const high = parseNumber(m[2]);
    if (low === null || high === null) return null;
    return { low, high, expectedText: null, unit: m[3].trim() || null };
  }
  if (/^[A-Za-z][A-Za-z ]{0,20}$/.test(t)) return { low: null, high: null, expectedText: t, unit: null };
  return null;
}

function parseAgeBand(s: string): { min: number; max: number } {
  const m = s.match(/(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s*(?:yrs?|years?)/i);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : { min: 0, max: 150 };
}

/** Parses range sheets: markdown tables and nested/inline bullet lists. */
function parseRanges(file: string, lines: Line[], aliases: AliasRow[]): RangeRow[] {
  const rows: RangeRow[] = [];
  let header: string[] | null = null;
  let current: string | null = null;

  const addName = (raw: string, line: number) => {
    const { name, alias } = splitParen(raw);
    if (alias) aliases.push({ alias, canonical: name, source: { file, line } });
    return name;
  };

  for (const l of lines) {
    const text = l.text.trim();

    // ---- Tables
    if (text.startsWith("|")) {
      const cells = text.split("|").slice(1, -1).map((c) => stripMd(c));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!header) {
        header = cells.map((c) => c.toLowerCase());
        continue;
      }
      const col = (re: RegExp) => header!.findIndex((h) => re.test(h));
      const iName = col(/analyte|test/);
      const iSex = col(/sex|gender/);
      const iAMin = col(/age min/);
      const iAMax = col(/age max/);
      const iMin = col(/min normal|lower|low/);
      const iMax = col(/max normal|upper|high/);
      const iUnit = col(/unit/);
      if (iName < 0 || iMin < 0 || iMax < 0) continue;
      rows.push({
        test: addName(cells[iName], l.n),
        sex: iSex >= 0 ? parseSexWord(cells[iSex]) : "All",
        ageMin: iAMin >= 0 ? (parseNumber(cells[iAMin]) ?? 0) : 0,
        ageMax: iAMax >= 0 ? (parseNumber(cells[iAMax]) ?? 150) : 150,
        low: parseNumber(cells[iMin]),
        high: parseNumber(cells[iMax]),
        expectedText: null,
        unit: iUnit >= 0 ? cells[iUnit] || null : null,
        source: { file, line: l.n },
      });
      continue;
    }
    header = null;

    // ---- Bullets: "* **Name**:" (parent) / "* **Name**: limits (Applicable to …)" (inline)
    const bullet = l.text.match(/^(\s*)[-*•]\s+(.*)$/);
    if (!bullet) continue;
    const indent = bullet[1].length;
    const body = bullet[2];

    if (indent === 0) {
      const m = body.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/) ?? body.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const rest = m[2].trim();
      if (!rest) {
        current = addName(m[1], l.n);
        continue;
      }
      const lim = parseLimits(rest);
      if (!lim) continue;
      const appl = rest.match(/\((?:applicable to\s*)?(.*?)\)/i)?.[1] ?? "";
      const band = parseAgeBand(appl);
      rows.push({ test: addName(m[1], l.n), sex: parseSexWord(appl), ageMin: band.min, ageMax: band.max, ...lim, source: { file, line: l.n } });
      current = null;
    } else if (current) {
      // "  * Male Demographic (18-100 yrs): 13.8 - 17.2 g/dL"
      const m = body.match(/^(.*?)\s*:\s*(.+)$/);
      if (!m) continue;
      const lim = parseLimits(m[2]);
      if (!lim) continue;
      const band = parseAgeBand(m[1]);
      rows.push({ test: current, sex: parseSexWord(m[1]), ageMin: band.min, ageMax: band.max, ...lim, source: { file, line: l.n } });
    }
  }
  return rows;
}

function parseCritical(file: string, lines: Line[]): CriticalRow[] {
  const rows: CriticalRow[] = [];
  let header: string[] | null = null;
  for (const l of lines) {
    const text = l.text.trim();
    if (!text.startsWith("|")) {
      header = null;
      continue;
    }
    const cells = text.split("|").slice(1, -1).map((c) => stripMd(c));
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    const iName = header.findIndex((h) => /analyte|test/.test(h));
    const iCond = header.findIndex((h) => /condition|trigger/.test(h));
    const iVal = header.findIndex((h) => /threshold|value/.test(h));
    const iUnit = header.findIndex((h) => /unit/.test(h));
    const threshold = parseNumber(cells[iVal] ?? "");
    if (iName < 0 || threshold === null) continue;
    const cond = (cells[iCond] ?? "").toLowerCase();
    rows.push({
      test: splitParen(cells[iName]).name,
      direction: /less|below|under|</.test(cond) ? "below" : "above",
      threshold,
      unit: cells[iUnit] ?? "",
      source: { file, line: l.n },
    });
  }
  return rows;
}

function parseGlossary(file: string, lines: Line[]): AliasRow[] {
  const rows: AliasRow[] = [];
  for (const l of lines) {
    const m = l.text.match(/\*\*(.+?)\*\*\s+(?:is the exact equivalent of|is equivalent to|maps to|=|is also called|means)\s+\*\*(.+?)\*\*(?:\s*\((.+?)\))?/i);
    if (!m) continue;
    rows.push({ alias: m[1].trim(), canonical: m[2].trim(), source: { file, line: l.n } });
    if (m[3]) rows.push({ alias: m[3].trim(), canonical: m[2].trim(), source: { file, line: l.n } });
  }
  return rows;
}

function parseSafety(file: string, lines: Line[]): SafetyRule[] {
  const rules: SafetyRule[] = [];
  for (const l of lines) {
    const m = l.text.match(/^\s*(\d+)\.\s*\*\*(.+?)\*\*\s*:?\s*(.+)$/);
    if (m) rules.push({ id: Number(m[1]), title: m[2].replace(/:$/, "").trim(), text: m[3].trim(), source: { file, line: l.n } });
  }
  return rules;
}

/**
 * Builds the knowledge base from the reference files. Each file is detected by
 * its content, so renamed or extra files still work.
 */
export function buildKnowledgeBase(files: CorpusFile[]): KnowledgeBase {
  const ranges: RangeRow[] = [];
  const critical: CriticalRow[] = [];
  const aliases: AliasRow[] = [];
  const safety: SafetyRule[] = [];
  let boundaryRule: KnowledgeBase["boundaryRule"] = { inclusive: true, source: null, text: "Default: a value exactly on a limit is treated as normal." };
  let criticalRule: KnowledgeBase["criticalRule"] = { inclusive: true, source: null, text: "Default: reaching the threshold counts as urgent." };

  for (const f of files) {
    const lines = cleanLines(f.content);
    const title = lines.find((l) => /^#\s/.test(l.text))?.text.toLowerCase() ?? "";
    if (isPatientReport(f.content)) continue;

    for (const l of lines) {
      if (/exactly/i.test(l.text) && /limit/i.test(l.text) && /normal/i.test(l.text)) {
        boundaryRule = { inclusive: true, source: { file: f.name, line: l.n }, text: stripMd(l.text) };
      }
      if (/hit or pass|reach or (?:pass|exceed)|at or (?:above|below)/i.test(l.text)) {
        criticalRule = { inclusive: true, source: { file: f.name, line: l.n }, text: stripMd(l.text) };
      }
    }

    if (/critical|dangerous|urgent/.test(title)) critical.push(...parseCritical(f.name, lines));
    else if (/glossary|nomenclature|mapping/.test(title)) aliases.push(...parseGlossary(f.name, lines));
    else if (/safety|compliance|rules/.test(title)) safety.push(...parseSafety(f.name, lines));
    else if (/range|reference/.test(title)) ranges.push(...parseRanges(f.name, lines, aliases));
  }

  const canonical = new Map<string, string>();
  for (const r of [...ranges, ...critical]) canonical.set(normKey(r.test), r.test);
  for (const a of aliases) if (!canonical.has(normKey(a.canonical))) canonical.set(normKey(a.canonical), a.canonical);

  return { ranges, critical, aliases, safety, boundaryRule, criticalRule, canonicalTests: [...canonical.values()] };
}
