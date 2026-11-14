/**
 * Flesch-Kincaid grade level. Test names and units (e.g. "hemoglobin", "mg/dL")
 * are removed first: the patient needs those words, and they would otherwise
 * push every sentence above class 8.
 */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function gradeLevel(text: string, ignoreTerms: string[] = []): number {
  let t = text;
  for (const term of ignoreTerms.filter(Boolean).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "it");
  }
  t = t.replace(/\b[\w./^×]*\d[\w./^×]*\b/g, "five"); // numbers and units read as short words
  const sentences = Math.max(1, (t.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = t.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

export const MAX_GRADE = 8;
