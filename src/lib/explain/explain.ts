import type { Analysis } from "../types";
import { AllProvidersFailed, anyProviderConfigured, complete, parseJsonReply, type ChatMessage } from "../llm/router";
import { gradeLevel } from "../verify/readability";
import { termsToIgnore, verifyExplanations, type Explanation, type Verification } from "../verify/verifier";
import { infoFor } from "./testInfo";
import { templateExplanation, templateQuestions } from "./templates";

export interface ExplainResult {
  explanations: Explanation[];
  questions: string[];
  urgentWarning: string | null;
  verification: Verification;
  mode: "ai-verified" | "ai-partial" | "template";
  provider: string | null;
  model: string | null;
  attempts: number;
  latencyMs: number;
  notes: string[];
}

const SYSTEM = `You explain lab results to patients in very simple English that a 13-year-old (class 8) can read.
Strict rules:
- Use ONLY the facts given. Never add numbers that are not in the facts.
- Never say the patient has a disease. Do not say "you have". Say what a value "can mean" and that only a doctor can diagnose.
- Keep the status exactly as given (normal / low / high / urgent / needs_info / cannot_classify / abnormal).
- Short sentences. Common words. 2 to 3 sentences per test.
- For urgent results, include "Please see a doctor today."
- For needs_info, say the right range cannot be chosen and ask for the missing detail.
- For cannot_classify, say it "cannot be classified from the files".
Reply with JSON only: {"explanations":[{"id":"t0","text":"..."}],"questions":["..."]}
"questions": 3 to 5 short questions the patient can ask the doctor, based on the results that are not normal.`;

function facts(a: Analysis) {
  return a.results.map((r) => {
    const info = infoFor(r.canonical);
    return {
      id: r.id,
      test: r.canonical ?? r.rawName,
      reportedAs: r.rawName,
      result: `${r.rawValue}${r.unit && !r.rawValue.includes(r.unit) ? " " + r.unit : ""}`,
      convertedResult: r.converted ? `${r.converted.value} ${r.converted.unit}` : undefined,
      normalRange: r.range ? (r.range.expectedText ?? `${r.range.low}-${r.range.high} ${r.range.unit ?? ""}`.trim()) : undefined,
      status: r.status,
      reason: r.reason,
      missingDetails: r.missing.length ? r.missing : undefined,
      whatItMeasures: info?.measures,
      whatLowCanMean: r.rangeStatus === "low" ? info?.low : undefined,
      whatHighCanMean: r.rangeStatus === "high" || r.rangeStatus === "abnormal" ? info?.high : undefined,
    };
  });
}

export function urgentWarning(a: Analysis): string | null {
  const urgent = a.results.filter((r) => r.status === "urgent");
  if (!urgent.length) return null;
  return `Urgent: ${urgent.map((r) => r.canonical ?? r.rawName).join(", ")} ${urgent.length > 1 ? "are" : "is"} at a level the lab marks as dangerous. Please see a doctor today.`;
}

function templateResult(a: Analysis, notes: string[], started: number): ExplainResult {
  const ignore = termsToIgnore(a);
  const explanations = a.results.map((r) => {
    const text = templateExplanation(r);
    return { id: r.id, text, source: "template" as const, grade: gradeLevel(text, ignore) };
  });
  const questions = templateQuestions(a);
  return {
    explanations,
    questions,
    urgentWarning: urgentWarning(a),
    verification: verifyExplanations(a, explanations, questions),
    mode: "template",
    provider: null,
    model: null,
    attempts: 0,
    latencyMs: Date.now() - started,
    notes,
  };
}

/**
 * Writer -> verifier loop. The AI rewrites the engine's facts in simple words;
 * the verifier rejects invented numbers, diagnoses, contradictions and hard
 * wording. Failed items are retried once with the exact problems, then fall
 * back to the safe template for just those items.
 */
export async function explain(a: Analysis, opts: { useAI?: boolean } = {}): Promise<ExplainResult> {
  const started = Date.now();
  const notes: string[] = [];
  if (opts.useAI === false) return templateResult(a, ["AI disabled for this request"], started);
  if (!anyProviderConfigured()) return templateResult(a, ["No AI key configured: using safe template explanations"], started);
  if (a.results.length === 0) return templateResult(a, ["No results found in the report"], started);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Facts (from the lab's rule engine):\n${JSON.stringify(facts(a), null, 1)}` },
  ];

  let provider: string | null = null;
  let model: string | null = null;
  let attempts = 0;
  let best: { items: { id: string; text: string }[]; questions: string[] } | null = null;
  let verification: Verification | null = null;

  try {
    for (attempts = 1; attempts <= 2; attempts++) {
      const res = await complete(messages, { json: true });
      provider = res.provider;
      model = res.model;
      const parsed = parseJsonReply<{ explanations?: { id: string; text: string }[]; questions?: string[] }>(res.text);
      if (!parsed?.explanations) {
        notes.push(`Attempt ${attempts}: reply was not valid JSON`);
        messages.push({ role: "assistant", content: res.text }, { role: "user", content: "That was not valid JSON. Reply with the JSON object only." });
        continue;
      }
      best = { items: parsed.explanations.filter((e) => e && typeof e.text === "string"), questions: (parsed.questions ?? []).filter((q) => typeof q === "string") };
      verification = verifyExplanations(a, best.items, best.questions);
      if (verification.passed) break;
      notes.push(`Attempt ${attempts}: verifier found ${verification.issues.length} problem(s); asking for a rewrite`);
      messages.push(
        { role: "assistant", content: res.text },
        { role: "user", content: `Fix these problems and reply with the full JSON again:\n- ${verification.issues.map((i) => `${i.id ?? "general"}: ${i.problem}`).join("\n- ")}` },
      );
    }
  } catch (err) {
    const why = err instanceof AllProvidersFailed ? err.details.join("; ") : (err as Error).message;
    return templateResult(a, [`AI unavailable (${why}). Using safe template explanations.`], started);
  }
  if (attempts > 2) attempts = 2;

  if (!best) return templateResult(a, [...notes, "AI replies could not be used; using templates"], started);

  // Keep verified AI items; replace any failing item with its template.
  const ignore = termsToIgnore(a);
  const badIds = new Set((verification?.issues ?? []).map((i) => i.id).filter(Boolean));
  const explanations: Explanation[] = a.results.map((r) => {
    const ai = best!.items.find((i) => i.id === r.id);
    if (ai && !badIds.has(r.id)) return { id: r.id, text: ai.text.trim(), source: "ai", grade: gradeLevel(ai.text, ignore) };
    const text = templateExplanation(r);
    return { id: r.id, text, source: "template", grade: gradeLevel(text, ignore) };
  });
  const qBad = [...badIds].some((id) => id?.startsWith("q")) || (verification?.issues ?? []).some((i) => /questions/.test(i.problem));
  const questions = qBad ? templateQuestions(a) : best.questions.slice(0, 5);
  const finalCheck = verifyExplanations(a, explanations, questions);
  const replaced = explanations.filter((e) => e.source === "template").length;
  if (replaced) notes.push(`${replaced} item(s) replaced by the safe template after verification`);

  return {
    explanations,
    questions,
    urgentWarning: urgentWarning(a),
    verification: finalCheck,
    mode: replaced || qBad ? "ai-partial" : "ai-verified",
    provider,
    model,
    attempts,
    latencyMs: Date.now() - started,
    notes,
  };
}
