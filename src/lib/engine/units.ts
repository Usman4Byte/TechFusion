import { normKey, normUnit, round } from "../data/text";

/**
 * Unit conversions. The lab files do not list conversion factors, so only
 * conversions that are mathematically exact are allowed:
 *  - pure scale changes (g/L -> g/dL, x10^9/L -> cells/mcL)
 *  - molar <-> mass using the molecule's molar mass (glucose 180.16 g/mol,
 *    cholesterol 386.65 g/mol). Everything else is "cannot be classified".
 */
interface Conversion {
  tests: string[] | "any"; // normKey of canonical test names
  from: string; // normUnit
  to: string; // normUnit
  factor: number;
  explain: string;
}

const CONVERSIONS: Conversion[] = [
  { tests: ["fastingbloodsugar"], from: "mmol/l", to: "mg/dl", factor: 18, explain: "glucose: 1 mmol/L = 18 mg/dL (molar mass 180.16 g/mol)" },
  { tests: ["cholesterol"], from: "mmol/l", to: "mg/dl", factor: 38.67, explain: "cholesterol: 1 mmol/L = 38.67 mg/dL (molar mass 386.65 g/mol)" },
  { tests: "any", from: "g/l", to: "g/dl", factor: 0.1, explain: "1 g/L = 0.1 g/dL (1 dL = 0.1 L)" },
  { tests: "any", from: "mg/l", to: "mg/dl", factor: 0.1, explain: "1 mg/L = 0.1 mg/dL" },
  { tests: "any", from: "x10^9/l", to: "cells/mcl", factor: 1000, explain: "1 ×10⁹/L = 1,000 cells/mcL" },
  { tests: "any", from: "x10^3/mcl", to: "cells/mcl", factor: 1000, explain: "1 ×10³/mcL = 1,000 cells/mcL" },
  { tests: "any", from: "k/mcl", to: "cells/mcl", factor: 1000, explain: "1 K/mcL = 1,000 cells/mcL" },
  { tests: "any", from: "mcliu/ml", to: "miu/l", factor: 1, explain: "1 µIU/mL = 1 mIU/L" },
  { tests: "any", from: "mciu/ml", to: "miu/l", factor: 1, explain: "1 µIU/mL = 1 mIU/L" },
];

function canonUnit(u: string | null | undefined): string {
  return normUnit(u)
    .replace(/×/g, "x")
    .replace(/10\*\*?|10\^/g, "10^")
    .replace(/^10\^/, "x10^")
    .replace(/^cells\/mm3$/, "cells/mcl")
    .replace(/^\/mcl$/, "cells/mcl");
}

export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  return canonUnit(a) === canonUnit(b);
}

export type ConvertResult =
  | { ok: true; value: number; formula: string | null; explain: string | null }
  | { ok: false; reason: string };

export function convert(value: number, fromUnit: string | null, toUnit: string | null, test: string): ConvertResult {
  // Unitless ranges (e.g. urine pH) accept unitless values.
  if (!toUnit) return fromUnit ? { ok: false, reason: `the range has no unit but the result is in ${fromUnit}` } : { ok: true, value, formula: null, explain: null };
  if (!fromUnit) return { ok: false, reason: `the result has no unit, but the range is in ${toUnit}` };
  if (sameUnit(fromUnit, toUnit)) return { ok: true, value, formula: null, explain: null };

  const f = canonUnit(fromUnit);
  const t = canonUnit(toUnit);
  const tk = normKey(test);
  const conv = CONVERSIONS.find((c) => c.from === f && c.to === t && (c.tests === "any" || c.tests.includes(tk)));
  if (conv) {
    const v = round(value * conv.factor, 2);
    return { ok: true, value: v, formula: `${value} ${fromUnit} × ${conv.factor} = ${v} ${toUnit}`, explain: conv.explain };
  }
  const rev = CONVERSIONS.find((c) => c.from === t && c.to === f && (c.tests === "any" || c.tests.includes(tk)));
  if (rev) {
    const v = round(value / rev.factor, 2);
    return { ok: true, value: v, formula: `${value} ${fromUnit} ÷ ${rev.factor} = ${v} ${toUnit}`, explain: rev.explain };
  }
  return { ok: false, reason: `no exact conversion from ${fromUnit} to ${toUnit} is defined for ${test}` };
}
