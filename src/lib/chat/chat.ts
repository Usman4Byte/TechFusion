import type { Analysis, KnowledgeBase, Report } from "../types";
import { AllProvidersFailed, anyProviderConfigured, complete, type ChatMessage } from "../llm/router";
import { checkPrivacy, isDiagnosisQuestion } from "../guard/privacy";
import { allowedNumbers, findDiagnosis, findUnsupportedNumbers } from "../verify/verifier";
import { templateExplanation } from "../explain/templates";
import { TEST_INFO } from "../explain/testInfo";
import { normKey } from "../data/text";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAnswer {
  answer: string;
  kind: "answer" | "refused" | "not_covered" | "needs_info";
  guard: { name: string; passed: boolean; detail: string }[];
  provider: string | null;
  citations: string[];
}

const DOCTOR_NOTE = "Only a licensed doctor can diagnose a condition.";
const NOT_COVERED = "The lab files do not cover this question.";

const SYSTEM = `You are LabLens, a warm, friendly assistant at CityLab Diagnostics. You chat with ONE patient about THEIR lab report.
Talk naturally, like a kind nurse explaining things: short sentences, simple words a 13-year-old understands, and a caring tone. Vary your wording, and use the conversation so far.

What you know (use ONLY this):
1. PATIENT_REPORT: this patient's own results, already checked by the lab's rule engine. Never change a status or a number.
2. LAB_REFERENCE: the lab's reference sheets (normal ranges, urgent limits, name aliases) and short plain-language notes about what each test measures. You may use these to answer general questions about any test listed there, even if the patient did not have that test (then say so kindly).
3. SAFETY_RULES: the lab's rules.

Rules you must follow:
- Never say the patient has a disease, and never guess one. If asked "do I have X?", gently say you can't diagnose, explain what their related results show (or that their report has no related test), and suggest asking their doctor.
- Never recommend medicines, doses, diets or treatments. Kindly say that's for their doctor, then offer something useful you CAN explain.
- Never invent numbers. Only use numbers from PATIENT_REPORT or LAB_REFERENCE.
- Never add facts that are not in what you know (no history, causes, statistics or extra medical detail). For aliases, just say the lab's glossary lists them as the same test.
- If the question is unrelated to lab results (e.g. weather, cooking), say "${NOT_COVERED}" in a friendly way and suggest what you can help with.
- If a range needs the patient's missing age or sex, say the right range cannot be chosen yet and ask for it.
- Never mention file names, AI models, rule engines or system internals. Say "your report" or "the lab's reference ranges".
- Keep answers to 2-5 sentences. No headings, no markdown tables. Don't repeat the patient's question back.`;

function referencePack(kb: KnowledgeBase) {
  const tests = kb.canonicalTests.map((name) => {
    const ranges = kb.ranges.filter((r) => normKey(r.test) === normKey(name));
    const urgent = kb.critical.find((c) => normKey(c.test) === normKey(name));
    const aliases = kb.aliases.filter((a) => normKey(a.canonical) === normKey(name)).map((a) => a.alias);
    const info = TEST_INFO[normKey(name)];
    return {
      test: name,
      alsoCalled: aliases.length ? aliases : undefined,
      normalRanges: ranges.length
        ? ranges.map((r) => `${r.expectedText ?? `${r.low}-${r.high}`}${r.unit ? " " + r.unit : ""} (${r.sex === "All" ? "all sexes" : r.sex}, age ${r.ageMin}-${r.ageMax})`)
        : "no range in the lab files (cannot be classified)",
      urgentWhen: urgent ? `${urgent.direction === "below" ? "at or below" : "at or above"} ${urgent.threshold} ${urgent.unit}` : undefined,
      whatItMeasures: info?.measures,
      ifLow: info?.low || undefined,
      ifHigh: info?.high || undefined,
    };
  });
  return {
    tests,
    edgeRule: kb.boundaryRule.text,
  };
}

function patientPack(report: Report, a: Analysis) {
  return {
    age: a.age.value ?? "missing",
    sex: a.sex.value ?? "missing",
    results: a.results.map((r) => ({
      test: r.canonical ?? r.rawName,
      reportedAs: r.rawName,
      result: `${r.rawValue}${r.unit && !r.rawValue.includes(r.unit) ? " " + r.unit : ""}`,
      converted: r.converted?.formula,
      normalRange: r.range ? (r.range.expectedText ?? `${r.range.low}-${r.range.high} ${r.range.unit ?? ""}`.trim()) : null,
      status: r.status,
      reason: r.reason,
    })),
  };
}

/** Numbers the chat may use: this patient's results plus the lab reference sheets. */
function chatNumbers(a: Analysis, kb: KnowledgeBase): Set<string> {
  const nums = allowedNumbers(a);
  const add = (n: number | null | undefined) => {
    if (n === null || n === undefined) return;
    nums.add(String(n));
    nums.add(n.toLocaleString("en-US"));
  };
  kb.ranges.forEach((r) => [r.low, r.high, r.ageMin, r.ageMax].forEach(add));
  kb.critical.forEach((c) => add(c.threshold));
  ["13", "180.16", "38.67", "386.65"].forEach((n) => nums.add(n));
  return nums;
}

function mentionedResults(q: string, a: Analysis) {
  const key = normKey(q);
  return a.results.filter((r) => [r.rawName, r.canonical].some((n) => n && normKey(n).length >= 2 && key.includes(normKey(n))));
}

/** Used only when every AI provider is down: still varied and helpful. */
function fallbackAnswer(q: string, a: Analysis): string {
  const hits = mentionedResults(q, a);
  if (hits.length) return hits.map(templateExplanation).join(" ");
  if (/\b(all|overall|summary|results?|report)\b/i.test(q)) return a.results.map(templateExplanation).join(" ");
  const tests = a.results.map((r) => r.canonical ?? r.rawName).join(", ");
  return `${NOT_COVERED} I can help you understand your ${tests} result${a.results.length > 1 ? "s" : ""}, though. Just ask!`;
}

const REFUSALS = [
  (tests: string) => `I'm sorry, but I can't share anyone else's results. Lab rules keep every patient's report private. I'm happy to go through your own ${tests} result with you, though!`,
  (tests: string) => `That's another person's private information, so I'm not able to look at it or share it. What I can do is help you understand your own ${tests} result. What would you like to know?`,
  (tests: string) => `I have to keep other patients' reports private, so I can't help with that one. Your own report is open, and I'd be glad to explain your ${tests} result.`,
];

async function aiRefusal(q: string, a: Analysis): Promise<{ text: string; provider: string | null }> {
  const tests = a.results.map((r) => r.canonical ?? r.rawName).join(" and ");
  const fallback = REFUSALS[Math.floor(Math.random() * REFUSALS.length)](tests);
  if (!anyProviderConfigured()) return { text: fallback, provider: null };
  try {
    // The AI never receives any other patient's data: only the question and this patient's test names.
    const res = await complete(
      [
        {
          role: "system",
          content: `You are LabLens, a warm assistant at a medical lab. The patient asked about someone else's records, which you must refuse (lab privacy rule). In 2-3 friendly sentences: say kindly that you can't share or look up other patients' information because every report is private, and offer to help with their own report, which includes: ${tests}. Do not mention any names, numbers or results. Vary your wording.`,
        },
        { role: "user", content: q },
      ],
      { maxTokens: 800, temperature: 0.8 },
    );
    // Never let a refusal carry numbers or claim to show results.
    if (/\d/.test(res.text) || /\b(here (are|is)|their results? (are|is|show))\b/i.test(res.text)) return { text: fallback, provider: null };
    return { text: res.text.trim(), provider: res.provider };
  } catch {
    return { text: fallback, provider: null };
  }
}

export async function answerQuestion(
  question: string,
  report: Report,
  analysis: Analysis,
  all: Report[],
  kb: KnowledgeBase,
  history: ChatTurn[] = [],
): Promise<ChatAnswer> {
  const guard: ChatAnswer["guard"] = [];
  const q = question.trim().slice(0, 600);

  // 1. Privacy lock: decided in code, before the AI sees anything.
  const privacy = checkPrivacy(q, report, all, kb);
  guard.push({ name: "Privacy lock", passed: privacy.allowed, detail: privacy.allowed ? `Only ${report.patientId}'s data is used` : `Blocked in code: mentions "${privacy.matched}"` });
  if (!privacy.allowed) {
    const r = await aiRefusal(q, analysis);
    return {
      answer: r.text,
      kind: "refused",
      guard,
      provider: r.provider,
      citations: privacy.rule ? [`${privacy.rule.file}, line ${privacy.rule.line} (${privacy.rule.title})`] : [],
    };
  }

  const dxQ = isDiagnosisQuestion(q);
  guard.push({ name: "Diagnosis guard", passed: true, detail: dxQ ? "Diagnosis question: explains values only" : "No diagnosis requested" });

  const allowed = chatNumbers(analysis, kb);
  const context = `PATIENT_REPORT:\n${JSON.stringify(patientPack(report, analysis))}\n\nLAB_REFERENCE:\n${JSON.stringify(referencePack(kb))}\n\nSAFETY_RULES:\n${kb.safety.map((r) => `${r.id}. ${r.title}: ${r.text}`).join("\n")}`;
  const past: ChatMessage[] = history
    .slice(-6)
    .filter((t) => t.content && t.content.length < 2000)
    .map((t) => ({ role: t.role, content: t.content }));

  let answer = "";
  let provider: string | null = null;
  let verified = false;

  if (anyProviderConfigured()) {
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM}\n\n${context}` },
      ...past,
      { role: "user", content: q },
    ];
    // 2. Writer -> verifier, with one rewrite if the verifier objects.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await complete(messages, { maxTokens: 1500, temperature: 0.6 });
        const bad = findUnsupportedNumbers(res.text, allowed);
        const dx = findDiagnosis(res.text);
        if (!bad.length && !dx) {
          answer = res.text.trim();
          provider = res.provider;
          verified = true;
          break;
        }
        guard.push({ name: `Verifier (try ${attempt})`, passed: false, detail: bad.length ? `unsupported numbers: ${bad.join(", ")}` : `diagnosis wording: "${dx}"` });
        messages.push(
          { role: "assistant", content: res.text },
          { role: "user", content: `Please rewrite your answer. Problem: ${bad.length ? `it uses numbers that are not in the lab data (${bad.join(", ")})` : `it sounds like a diagnosis ("${dx}")`}. Keep it friendly and follow the rules.` },
        );
      } catch (e) {
        guard.push({ name: "AI provider", passed: false, detail: e instanceof AllProvidersFailed ? "All models busy: rule-based answer" : "AI error: rule-based answer" });
        break;
      }
    }
  }

  if (!verified) answer = fallbackAnswer(q, analysis);
  guard.push({ name: "Numbers verified", passed: true, detail: verified ? "Every number comes from the report or the lab sheets" : "Rule-based answer" });
  guard.push({ name: "No diagnosis", passed: true, detail: "No disease is stated" });

  if (dxQ && !/doctor/i.test(answer)) answer = `${answer} ${DOCTOR_NOTE}`;

  const kind: ChatAnswer["kind"] = answer.startsWith(NOT_COVERED) ? "not_covered" : analysis.needsInfo.length && /range cannot|missing/i.test(answer) ? "needs_info" : "answer";
  const citations = mentionedResults(q, analysis).flatMap((r) => [`${r.source.file}, line ${r.source.line}`, ...(r.range ? [`${r.range.source.file}, line ${r.range.source.line}`] : [])]);
  return { answer: answer.trim(), kind, guard, provider, citations: [...new Set(citations)] };
}
