import type { KnowledgeBase, SourceRef } from "../types";
import { normKey } from "../data/text";

/**
 * Extra names seen in real reports that the glossary does not list.
 * Kept small and explicit; each one is documented in the README as an assumption.
 */
export const SUPPLEMENTARY_ALIASES: Record<string, string> = {
  phlevel: "Urine pH",
  ph: "Urine pH",
  protein: "Urine Protein",
  urineprotein: "Urine Protein",
  hgb: "Hemoglobin",
  haemoglobin: "Hemoglobin",
  platelets: "Platelet Count",
  plateletcount: "Platelet Count",
  fastingglucose: "Fasting Blood Sugar",
  fastingbloodglucose: "Fasting Blood Sugar",
  fbg: "Fasting Blood Sugar",
  totalcholesterol: "Cholesterol",
  thyroidstimulatinghormone: "TSH",
};

export interface AliasMatch {
  canonical: string;
  via: "exact" | "glossary" | "range-sheet" | "supplementary";
  source?: SourceRef;
}

export function resolveTestName(rawName: string, kb: KnowledgeBase): AliasMatch | null {
  const key = normKey(rawName);
  if (!key) return null;

  const exact = kb.canonicalTests.find((c) => normKey(c) === key);
  if (exact) return { canonical: exact, via: "exact" };

  // Follow alias chains (e.g. "Hb" -> "Hemoglobin").
  const alias = kb.aliases.find((a) => normKey(a.alias) === key);
  if (alias) {
    const target = kb.canonicalTests.find((c) => normKey(c) === normKey(alias.canonical)) ?? alias.canonical;
    const fromGlossary = !/range/i.test(alias.source.file);
    return { canonical: target, via: fromGlossary ? "glossary" : "range-sheet", source: alias.source };
  }

  const supp = SUPPLEMENTARY_ALIASES[key];
  if (supp) {
    const target = kb.canonicalTests.find((c) => normKey(c) === normKey(supp));
    if (target) return { canonical: target, via: "supplementary" };
  }
  return null;
}
