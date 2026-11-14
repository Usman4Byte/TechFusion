import type { KnowledgeBase, Report } from "../types";

export interface GuardDecision {
  allowed: boolean;
  reason?: string;
  rule?: { title: string; file: string; line: number };
  matched?: string;
}

const OTHER_PATIENT_PHRASES = /\b(?:another|other|different|someone else'?s?|all|every|list(?: of| all)?) (?:patients?|people'?s?|persons?|reports?|users?)\b|\bwho else\b|\bpatient (?:list|database|records)\b/i;
const ID_RE = /\b(?:P\d{3,}|CLD-P\d{3,}-\d+)\b/gi;

/**
 * Lab safety rule 1 (context lock): code decides before any AI call whether a
 * question is about somebody other than the current patient.
 */
export function checkPrivacy(question: string, current: Report, all: Report[], kb: KnowledgeBase): GuardDecision {
  const rule = kb.safety.find((r) => /privacy/i.test(r.title));
  const ruleRef = rule ? { title: rule.title, file: rule.source.file, line: rule.source.line } : undefined;
  const refuse = (matched: string): GuardDecision => ({
    allowed: false,
    matched,
    rule: ruleRef,
    reason: "I can only talk about the report that is open right now. I can't share or discuss another patient's results. This follows the lab's privacy rule.",
  });

  for (const m of question.match(ID_RE) ?? []) {
    const id = m.toUpperCase().match(/P\d{3,}/)![0];
    if (id !== current.patientId.toUpperCase()) return refuse(m);
  }

  const mine = new Set((current.name ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  for (const other of all) {
    if (other.patientId === current.patientId || !other.name) continue;
    const full = other.name.toLowerCase();
    if (question.toLowerCase().includes(full)) return refuse(other.name);
    const first = full.split(/\s+/)[0];
    if (first.length >= 3 && !mine.has(first) && new RegExp(`\\b${first}\\b`, "i").test(question)) return refuse(other.name.split(/\s+/)[0]);
  }

  if (OTHER_PATIENT_PHRASES.test(question)) return refuse(question.match(OTHER_PATIENT_PHRASES)![0]);
  return { allowed: true };
}

const DIAGNOSIS_Q = /\b(?:do|does|did|am|is|could|can|might|will) (?:i|he|she|they|this|that|it|my result|the patient)\b.*\b(?:have|has|got|mean|means|suffer|be|indicate|show)\b.*\b(?:disease|diabetes|diabetic|anemi[ac]|anaemi[ac]|cancer|hepatitis|infection|leukemia|thyroid problem|kidney (?:disease|problem|failure)|liver (?:disease|damage|failure)|sick|ill|condition|disorder)\b|\bdiagnos/i;

export function isDiagnosisQuestion(q: string): boolean {
  return DIAGNOSIS_Q.test(q);
}
