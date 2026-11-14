import type { Analysis, KnowledgeBase, Report } from "../types";
import { AllProvidersFailed, anyProviderConfigured, complete } from "../llm/router";
import { checkPrivacy, isDiagnosisQuestion } from "../guard/privacy";
import { allowedNumbers, findDiagnosis, findUnsupportedNumbers } from "../verify/verifier";
import { templateExplanation } from "../explain/templates";
import { normKey } from "../data/text";

export interface ChatAnswer {
  answer: string;
  kind: "answer" | "refused" | "not_covered" | "needs_info";
  guard: { name: string; passed: boolean; detail: string }[];
  provider: string | null;
  citations: string[];
}

const DOCTOR_NOTE = "Only a licensed doctor can diagnose a condition.";
const NOT_COVERED = "The lab files do not cover this question.";

const SYSTEM = `You answer one patient's questions about THEIR lab report, in very simple English (class 8 level).
Rules:
- Use ONLY the facts provided. If the facts do not answer the question, reply exactly: "${NOT_COVERED}" and, if part of it is covered, answer only that part.
- Never say the patient has a disease. Never diagnose. You may say what a value "can mean".
- Never invent numbers. Never talk about other patients.
- If a result needs missing age or sex, say the right range cannot be chosen and ask for it.
- If asked "do I have <disease>?", say you cannot diagnose, then explain what their related results show and suggest asking the doctor.
- 2 to 5 short sentences. Mention which test(s) you used.`;

function mentionedResults(q: string, a: Analysis) {
  const key = normKey(q);
  return a.results.filter((r) => [r.rawName, r.canonical].some((n) => n && normKey(n).length >= 2 && key.includes(normKey(n))));
}

function fallbackAnswer(q: string, a: Analysis): string {
  const hits = mentionedResults(q, a);
  if (hits.length) return hits.map(templateExplanation).join(" ");
  if (/\b(all|overall|summary|results?|report)\b/i.test(q)) return a.results.map(templateExplanation).join(" ");
  return NOT_COVERED;
}

export async function answerQuestion(question: string, report: Report, analysis: Analysis, all: Report[], kb: KnowledgeBase): Promise<ChatAnswer> {
  const guard: ChatAnswer["guard"] = [];
  const q = question.trim().slice(0, 600);

  const privacy = checkPrivacy(q, report, all, kb);
  guard.push({ name: "Privacy lock", passed: privacy.allowed, detail: privacy.allowed ? `Only ${report.patientId}'s data is used` : `Refused: mentions "${privacy.matched}"` });
  if (!privacy.allowed) {
    return {
      answer: privacy.reason!,
      kind: "refused",
      guard,
      provider: null,
      citations: privacy.rule ? [`${privacy.rule.file}, line ${privacy.rule.line} (${privacy.rule.title})`] : [],
    };
  }

  const dxQ = isDiagnosisQuestion(q);
  guard.push({ name: "Diagnosis question", passed: true, detail: dxQ ? "Detected: will explain values only, no diagnosis" : "Not a diagnosis question" });

  const facts = {
    patient: { id: report.patientId, age: analysis.age.value ?? "missing", sex: analysis.sex.value ?? "missing" },
    results: analysis.results.map((r) => ({
      test: r.canonical ?? r.rawName,
      reportedAs: r.rawName,
      result: `${r.rawValue}${r.unit && !r.rawValue.includes(r.unit) ? " " + r.unit : ""}`,
      converted: r.converted?.formula,
      normalRange: r.range ? (r.range.expectedText ?? `${r.range.low}-${r.range.high} ${r.range.unit ?? ""}`.trim()) : null,
      status: r.status,
      reason: r.reason,
    })),
  };

  let answer: string;
  let provider: string | null = null;
  if (anyProviderConfigured()) {
    try {
      const res = await complete(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Facts:\n${JSON.stringify(facts)}\n\nQuestion: ${q}` },
        ],
        { maxTokens: 1500 },
      );
      answer = res.text;
      provider = res.provider;
    } catch (e) {
      answer = fallbackAnswer(q, analysis);
      guard.push({ name: "AI provider", passed: false, detail: e instanceof AllProvidersFailed ? "All providers busy: rule-based answer" : "AI error: rule-based answer" });
    }
  } else {
    answer = fallbackAnswer(q, analysis);
  }

  // Verify the answer before it reaches the patient.
  const bad = findUnsupportedNumbers(answer, allowedNumbers(analysis));
  const dx = findDiagnosis(answer);
  guard.push({ name: "Numbers verified", passed: bad.length === 0, detail: bad.length ? `Removed AI answer: unsupported numbers ${bad.join(", ")}` : "All numbers come from the report" });
  guard.push({ name: "No diagnosis", passed: !dx, detail: dx ? `Removed AI answer: "${dx}"` : "No diagnosis wording" });
  if (bad.length || dx) {
    answer = fallbackAnswer(q, analysis);
    provider = null;
  }

  if (dxQ || /\b(mean|serious|worry|dangerous|disease)\b/i.test(q)) {
    if (!answer.includes(DOCTOR_NOTE)) answer = `${answer} ${DOCTOR_NOTE}`;
  }

  const kind: ChatAnswer["kind"] = answer.startsWith(NOT_COVERED) ? "not_covered" : analysis.needsInfo.length && /range cannot|missing/i.test(answer) ? "needs_info" : "answer";
  const citations = mentionedResults(q, analysis).flatMap((r) => [`${r.source.file}, line ${r.source.line}`, ...(r.range ? [`${r.range.source.file}, line ${r.range.source.line}`] : [])]);
  return { answer: answer.trim(), kind, guard, provider, citations: [...new Set(citations)] };
}
