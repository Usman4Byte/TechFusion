"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Demographic, Sex, Status, TestResult } from "@/lib/types";
import type { ExplainResult } from "@/lib/explain/explain";
import type { ChatAnswer } from "@/lib/chat/chat";
import { BodyMap } from "./BodyMap";
import { ReportPicker, type PatientItem } from "./ReportPicker";
import { Card, RangeGauge, StatusChip, STATUS_STYLE } from "./ui";

interface AnalyzeResponse {
  patient: { id: string; name: string | null; mrn: string | null; issued: string | null; age: Demographic<number>; sex: Demographic<Sex> };
  needsInfo: ("age" | "sex")[];
  hasUrgent: boolean;
  summary: Record<Status, number>;
  results: TestResult[];
  explanation: ExplainResult;
  safetyNote: string;
}
interface Health { providers: { id: string; label: string; configured: boolean; state: string; model: string }[] }

type Source = { patientId: string } | { reportText: string };

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : String(n));

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

function ProviderDot() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/health").then((r) => r.json()).then(setH).catch(() => setH(null));
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  const configured = h?.providers.filter((p) => p.configured) ?? [];
  const ok = configured.filter((p) => p.state === "ok");
  const color = !h ? "bg-muted" : configured.length === 0 ? "bg-info" : ok.length ? "bg-ok" : "bg-warn";
  const label = !h ? "Checking AI…" : configured.length === 0 ? "Safe template mode" : ok.length ? `AI ready · ${ok[0].label}` : "AI busy · fallback on";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted" title={configured.map((p) => `${p.label}: ${p.state}`).join("\n")}>
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function WhyPanel({ r }: { r: TestResult }) {
  return (
    <ol className="mt-3 space-y-2 border-l-2 border-brand/40 pl-4 text-sm">
      {r.evidence.map((e, i) => (
        <li key={i}>
          <span className="font-medium">{e.label}:</span> <span>{e.detail}</span>
          {e.source && (
            <span className="ml-1 rounded bg-gray-soft px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {e.source.file}:{e.source.line}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function ResultRow({ r, text, source, grade }: { r: TestResult; text?: string; source?: string; grade?: number }) {
  const [open, setOpen] = useState(false);
  const alias = r.canonical && r.canonical.toLowerCase() !== r.rawName.toLowerCase();
  const unit = r.unit && !r.rawValue.includes(r.unit) ? ` ${r.unit}` : "";
  return (
    <li className={`rounded-xl border p-4 ${r.status === "urgent" ? "border-bad/50 bg-bad-soft/40" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            {r.canonical ?? r.rawName}
            {alias && <span className="ml-2 text-xs font-normal text-muted">reported as “{r.rawName}”</span>}
          </div>
          <div className="mt-0.5 text-sm">
            <span className="font-mono text-base">{r.rawValue}{unit}</span>
            {r.converted && <span className="ml-2 text-muted">= <span className="font-mono">{fmt(r.converted.value)} {r.converted.unit}</span></span>}
            {r.range && (
              <span className="ml-2 text-muted">
                · normal {r.range.expectedText ?? `${fmt(r.range.low!)}–${fmt(r.range.high!)}${r.range.unit ? " " + r.range.unit : ""}`}
              </span>
            )}
          </div>
        </div>
        <StatusChip status={r.status} />
      </div>
      <RangeGauge r={r} />
      {text && (
        <p className="mt-2 leading-relaxed">
          {text}
          <span className="ml-2 inline-flex gap-1 align-middle text-[10px] text-muted">
            <span className="rounded bg-gray-soft px-1.5 py-0.5">{source === "ai" ? "AI · verified" : "rule-based"}</span>
            {grade !== undefined && <span className="rounded bg-gray-soft px-1.5 py-0.5">grade {grade}</span>}
          </span>
        </p>
      )}
      <button onClick={() => setOpen(!open)} className="no-print mt-2 text-sm font-medium text-brand hover:underline">
        {open ? "Hide working" : "Why? Show the working"}
      </button>
      {open && <WhyPanel r={r} />}
    </li>
  );
}

function NeedsInfoForm({ missing, onSubmit }: { missing: ("age" | "sex")[]; onSubmit: (v: { age?: number; sex?: Sex }) => void }) {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | Sex>("");
  const ready = (!missing.includes("age") || /^\d{1,3}$/.test(age)) && (!missing.includes("sex") || sex);
  return (
    <div className="rounded-2xl border border-info/40 bg-info-soft p-4">
      <p className="font-semibold text-info">We need a bit more information</p>
      <p className="mt-1 text-sm">
        Normal ranges depend on {missing.join(" and ")}, and this report does not include {missing.length > 1 ? "them" : "it"}. We will not guess. Please tell us:
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSubmit({ age: missing.includes("age") ? Number(age) : undefined, sex: missing.includes("sex") ? (sex as Sex) : undefined });
        }}
      >
        {missing.includes("age") && (
          <label className="text-sm">
            Age
            <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" className="mt-1 block w-24 rounded-lg border border-line bg-panel px-3 py-2" placeholder="e.g. 45" />
          </label>
        )}
        {missing.includes("sex") && (
          <label className="text-sm">
            Sex at birth
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="mt-1 block rounded-lg border border-line bg-panel px-3 py-2">
              <option value="">Choose…</option>
              <option>Female</option>
              <option>Male</option>
            </select>
          </label>
        )}
        <button disabled={!ready} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Use these details</button>
      </form>
    </div>
  );
}

function Avatar() {
  return <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">L</div>;
}

/** Reveals the answer word by word, like a live AI reply. */
function useTypewriter(text: string, enabled: boolean, onDone?: () => void) {
  const [shown, setShown] = useState(enabled ? "" : text);
  useEffect(() => {
    if (!enabled) {
      setShown(text);
      return;
    }
    const words = text.split(/(\s+)/);
    let i = 0;
    const step = Math.max(1, Math.ceil(words.length / 90)); // finishes in ~1.5 s
    const t = setInterval(() => {
      i += step;
      setShown(words.slice(0, i).join(""));
      if (i >= words.length) {
        clearInterval(t);
        onDone?.();
      }
    }, 18);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled]);
  return shown;
}

function BotMessage({ a, animate, onDone }: { a: ChatAnswer; animate: boolean; onDone: () => void }) {
  const [typedOnce] = useState(animate);
  const shown = useTypewriter(a.answer, typedOnce, onDone);
  const [open, setOpen] = useState(false);
  const passed = a.guard.filter((g) => g.passed).length;
  return (
    <div className="flex items-start gap-2">
      <Avatar />
      <div className={`max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed ${a.kind === "refused" ? "bg-bad-soft" : "bg-gray-soft"}`}>
        <p className="whitespace-pre-line">{shown}</p>
        {shown.length >= a.answer.length && (
          <div className="mt-1.5 text-[11px] text-muted">
            <button onClick={() => setOpen(!open)} className="hover:underline">
              🛡 {a.kind === "refused" ? "Blocked by privacy lock" : `${passed} safety checks`}
              {a.provider ? ` · ${a.provider.replace(/^Gemini \((.*)\)$/, "$1")}` : " · rule-based"}
            </button>
            {open && (
              <ul className="mt-1 space-y-0.5">
                {a.guard.map((g, i) => (
                  <li key={i}>{g.passed ? "✓" : "↻"} {g.name}: {g.detail}</li>
                ))}
                {a.citations.map((c) => <li key={c}>📄 {c}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBox({ source, overrides }: { source: Source; overrides: { age?: number; sex?: Sex } }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a?: ChatAnswer; err?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLog([]);
  }, [source]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [log]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ("");
    setLog((l) => [...l, { q: question }]);
    try {
      const history = log
        .filter((m) => m.a)
        .slice(-3)
        .flatMap((m) => [
          { role: "user" as const, content: m.q },
          { role: "assistant" as const, content: m.a!.answer },
        ]);
      const a = await postJson<ChatAnswer>("/api/chat", { ...source, ...overrides, question, history });
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, err: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  };

  const suggestions = ["Explain my results simply", "Should I be worried?", "What does each test measure?", "What should I ask my doctor?"];
  return (
    <Card title="Ask about this report" className="no-print">
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {log.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-gray-soft">{s}</button>
            ))}
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className="space-y-1.5">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-sm text-white">{m.q}</div>
            {m.a && <BotMessage a={m.a} animate={i === log.length - 1} onDone={() => endRef.current?.scrollIntoView({ block: "nearest" })} />}
            {m.err && <div className="text-sm text-bad">{m.err}</div>}
            {!m.a && !m.err && (
              <div className="flex items-center gap-2">
                <Avatar />
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-gray-soft px-3 py-3">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} placeholder="Type a question…" className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm" />
        <button disabled={busy || !q.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Ask</button>
      </form>
    </Card>
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export default function LabLensApp() {
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [overrides, setOverrides] = useState<{ age?: number; sex?: Sex }>({});
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patients").then((r) => r.json()).then(setPatients).catch(() => setError("Could not load the patient list."));
  }, []);

  const run = useCallback(async (src: Source, ov: { age?: number; sex?: Sex } = {}) => {
    setSource(src);
    setOverrides(ov);
    setLoading(true);
    setError(null);
    try {
      setData(await postJson<AnalyzeResponse>("/api/analyze", { ...src, ...ov }));
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const ex = data?.explanation;
  const textFor = (id: string) => ex?.explanations.find((e) => e.id === id);
  const activeId = source && "patientId" in source ? source.patientId : null;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand font-bold text-white">L</div>
            <div>
              <div className="font-bold leading-tight">LabLens</div>
              <div className="hidden text-xs text-muted sm:block">Your lab report in simple words · computed, cited, checked</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProviderDot />
            <Link href="/tests" className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:bg-gray-soft">Self-test</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[280px_1fr]">
        <aside className="no-print space-y-3">
          <Card>
            <ReportPicker
              patients={patients}
              activeId={activeId}
              uploadedName={activeId ? null : uploadedName}
              onPick={(id) => run({ patientId: id })}
              onText={(text, name) => {
                setUploadedName(name);
                run({ reportText: text });
              }}
            />
          </Card>
          <p className="px-1 text-xs text-muted">Only the open report is ever shown or sent to the AI. Other patients stay locked.</p>
        </aside>

        <main className="min-w-0 space-y-4">
          {!data && !loading && !error && (
            <Card>
              <div className="py-10 text-center">
                <h1 className="text-2xl font-bold">Understand your lab report</h1>
                <p className="mx-auto mt-2 max-w-xl text-muted">
                  Pick a report on the left. Each result is checked against the lab&apos;s own range sheets by exact rules, explained in simple words, and every step shows where it came from.
                </p>
                <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left text-sm sm:grid-cols-3">
                  {[
                    ["1 · Compute", "Rules match names, convert units and pick the right range for age and sex."],
                    ["2 · Explain", "AI writes simple sentences using only those facts."],
                    ["3 · Check", "A verifier rejects invented numbers, diagnoses and hard words."],
                  ].map(([h, d]) => (
                    <div key={h} className="rounded-xl border border-line p-3">
                      <div className="font-semibold text-brand">{h}</div>
                      <div className="mt-1 text-muted">{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {loading && (
            <Card>
              <div className="animate-pulse space-y-3">
                <div className="h-5 w-1/3 rounded bg-gray-soft" />
                <div className="h-20 rounded bg-gray-soft" />
                <div className="h-20 rounded bg-gray-soft" />
                <p className="text-sm text-muted">Computing results and writing a simple explanation…</p>
              </div>
            </Card>
          )}

          {error && !loading && <div className="rounded-2xl border border-bad/40 bg-bad-soft p-4 text-bad">{error}</div>}

          {data && !loading && (
            <>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-muted">{data.patient.id}{data.patient.mrn ? ` · MRN ${data.patient.mrn}` : ""}{data.patient.issued ? ` · issued ${data.patient.issued}` : ""}</div>
                    <h1 className="text-xl font-bold">{data.patient.name ?? "Uploaded report"}</h1>
                    <div className="mt-1 flex flex-wrap gap-2 text-sm">
                      {(["age", "sex"] as const).map((k) => {
                        const d = data.patient[k];
                        return (
                          <span key={k} className={`rounded-full px-2.5 py-0.5 ${d.value === null ? "bg-info-soft text-info" : "bg-gray-soft"}`}>
                            {k === "age" ? "Age" : "Sex"}: {d.value ?? `missing (${d.raw ?? "not in report"})`}
                            {d.providedByUser ? " · you told us" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(data.summary) as Status[]).filter((s) => data.summary[s] > 0).map((s) => (
                      <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[s].cls}`}>{data.summary[s]} {STATUS_STYLE[s].label}</span>
                    ))}
                  </div>
                </div>
              </Card>

              {ex?.urgentWarning && (
                <div role="alert" className="rounded-2xl border-2 border-bad bg-bad-soft p-4">
                  <div className="text-lg font-bold text-bad">⚠ See a doctor today</div>
                  <p className="mt-1">{ex.urgentWarning}</p>
                </div>
              )}

              {data.needsInfo.length > 0 && source && <NeedsInfoForm missing={data.needsInfo} onSubmit={(v) => run(source, { ...overrides, ...v })} />}

              <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                <div className="min-w-0 space-y-4">
                  <Card
                    title="Your results"
                    right={
                      <button onClick={() => speak(ex?.explanations.map((e) => e.text).join(" ") ?? "")} className="no-print rounded-full border border-line px-3 py-1 text-xs hover:bg-gray-soft">
                        🔊 Read aloud
                      </button>
                    }
                  >
                    <ul className="space-y-3">
                      {data.results.map((r) => {
                        const e = textFor(r.id);
                        return <ResultRow key={r.id} r={r} text={e?.text} source={e?.source} grade={e?.grade} />;
                      })}
                    </ul>
                    {data.results.length === 0 && <p className="text-muted">No test results were found in this report.</p>}
                  </Card>

                  <Card
                    title="Questions to ask your doctor"
                    right={<button onClick={() => window.print()} className="no-print rounded-full border border-line px-3 py-1 text-xs hover:bg-gray-soft">🖨 Doctor visit sheet</button>}
                  >
                    <ol className="list-decimal space-y-1.5 pl-5">
                      {ex?.questions.map((q, i) => <li key={i}>{q}</li>)}
                    </ol>
                    <p className="mt-3 text-sm text-muted">{data.safetyNote}</p>
                  </Card>

                  {source && <ChatBox source={source} overrides={overrides} />}
                </div>

                <div className="space-y-4">
                  <Card title="Body map">
                    <BodyMap results={data.results} />
                  </Card>
                  {ex && (
                    <Card title="Safety checks" className="no-print">
                      <ul className="space-y-1.5 text-sm">
                        {ex.verification.checks.map((c) => (
                          <li key={c.name} className="flex gap-2" title={c.detail}>
                            <span className={c.passed ? "text-ok" : "text-warn"}>{c.passed ? "✓" : "!"}</span>
                            <span>{c.name}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 space-y-0.5 border-t border-line pt-3 text-xs text-muted">
                        <div>Mode: {ex.mode === "template" ? "rule-based (no AI)" : ex.mode === "ai-verified" ? "AI, fully verified" : "AI + rule-based fixes"}</div>
                        {ex.provider && <div>Model: {ex.provider} · {ex.model}</div>}
                        <div>Attempts: {ex.attempts} · {(ex.latencyMs / 1000).toFixed(1)}s · cost $0</div>
                        {ex.notes.map((n, i) => <div key={i}>• {n}</div>)}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
