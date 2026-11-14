"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Demographic, Sex, Status, TestResult } from "@/lib/types";
import type { ExplainResult } from "@/lib/explain/explain";
import type { ChatAnswer } from "@/lib/chat/chat";
import { BodyMap } from "./BodyMap";
import { ReportPicker, type PatientItem } from "./ReportPicker";
import { Card, GhostButton, RangeGauge, StatusChip } from "./ui";
import {
  IconAlert,
  IconArrowRight,
  IconBody,
  IconChat,
  IconCheck,
  IconFlask,
  IconInfo,
  IconLock,
  IconLogo,
  IconPrint,
  IconPulse,
  IconSend,
  IconShield,
  IconSpeaker,
  IconStethoscope,
  IconUpload,
} from "./icons";

interface AnalyzeResponse {
  patient: { id: string; name: string | null; mrn: string | null; issued: string | null; age: Demographic<number>; sex: Demographic<Sex> };
  needsInfo: ("age" | "sex")[];
  hasUrgent: boolean;
  summary: Record<Status, number>;
  results: TestResult[];
  explanation: ExplainResult;
  safetyNote: string;
}

type Source = { patientId: string } | { reportText: string; fileName?: string };

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : String(n));

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

function StatusPill() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/health").then((r) => setOk(r.ok)).catch(() => setOk(false));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-body sm:inline-flex">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-ok" : ok === false ? "bg-warn" : "bg-muted"}`} />
      {ok ? "Online" : ok === false ? "Reconnecting" : "Connecting"}
    </span>
  );
}

/** Friendly document names instead of raw file names. */
function sourceLabel(file: string): string {
  if (/glossary/i.test(file)) return "Lab glossary";
  if (/urgent|critical|dangerous/i.test(file)) return "Urgent values list";
  if (/range/i.test(file)) return "Lab reference ranges";
  if (/safety|rule/i.test(file)) return "Lab safety rules";
  return "Your report";
}

function WhyPanel({ r }: { r: TestResult }) {
  return (
    <ol className="mt-3 space-y-2.5 rounded-xl bg-gray-soft p-4 text-sm">
      {r.evidence.map((e, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-panel text-[10px] font-bold text-brand shadow-sm">{i + 1}</span>
          <span>
            <span className="font-semibold text-ink">{e.label}.</span> {e.detail}
            {e.source && <span className="ml-1.5 rounded-md bg-panel px-1.5 py-0.5 text-[11px] text-muted">{sourceLabel(e.source.file)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ResultRow({ r, text }: { r: TestResult; text?: string }) {
  const [open, setOpen] = useState(false);
  const alias = r.canonical && r.canonical.toLowerCase() !== r.rawName.toLowerCase();
  const unit = r.unit && !r.rawValue.includes(r.unit) ? ` ${r.unit}` : "";
  const accent = r.status === "urgent" ? "border-l-bad" : ["low", "high", "abnormal"].includes(r.status) ? "border-l-warn" : r.status === "normal" ? "border-l-ok" : "border-l-line";
  return (
    <li className={`rounded-xl border border-line border-l-4 bg-panel p-4 ${accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-base font-semibold">{r.canonical ?? r.rawName}</h3>
            {alias && <span className="text-xs text-muted">listed as {r.rawName}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="text-xl font-bold tracking-tight text-ink">
              {r.rawValue}
              <span className="ml-1 text-sm font-medium text-muted">{unit.trim()}</span>
            </span>
            {r.converted && (
              <span className="text-muted">
                = <span className="font-semibold text-ink">{fmt(r.converted.value)}</span> {r.converted.unit}
              </span>
            )}
            {r.range && (
              <span className="text-muted">
                Normal: {r.range.expectedText ?? `${fmt(r.range.low!)}–${fmt(r.range.high!)}${r.range.unit ? " " + r.range.unit : ""}`}
              </span>
            )}
          </div>
        </div>
        <StatusChip status={r.status} />
      </div>
      <RangeGauge r={r} />
      {text && <p className="mt-2 leading-relaxed text-body">{text}</p>}
      <button onClick={() => setOpen(!open)} className="no-print mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
        {open ? "Hide details" : "How was this worked out?"}
      </button>
      {open && <WhyPanel r={r} />}
    </li>
  );
}

function NeedsInfoForm({ missing, onSubmit }: { missing: ("age" | "sex")[]; onSubmit: (v: { age?: number; sex?: Sex }) => void }) {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | Sex>("");
  const ready = (!missing.includes("age") || /^\d{1,3}$/.test(age)) && (!missing.includes("sex") || sex);
  const field = "mt-1 block rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-brand focus:ring-4 focus:ring-brand/10 focus:outline-none";
  return (
    <div className="rounded-2xl border border-info/25 bg-info-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-panel text-info shadow-sm"><IconInfo className="h-5 w-5" /></span>
        <div className="flex-1">
          <p className="font-semibold text-ink">A little more information is needed</p>
          <p className="mt-0.5 text-sm">
            Normal ranges depend on {missing.join(" and ")}, which {missing.length > 1 ? "are" : "is"} not on this report. Please add {missing.length > 1 ? "them" : "it"} so we can choose the right range.
          </p>
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) onSubmit({ age: missing.includes("age") ? Number(age) : undefined, sex: missing.includes("sex") ? (sex as Sex) : undefined });
            }}
          >
            {missing.includes("age") && (
              <label className="text-xs font-medium text-muted">
                Age
                <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" className={`${field} w-24`} placeholder="e.g. 45" />
              </label>
            )}
            {missing.includes("sex") && (
              <label className="text-xs font-medium text-muted">
                Sex at birth
                <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className={field}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                </select>
              </label>
            )}
            <button disabled={!ready} className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink disabled:opacity-40">
              Update results
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-white">
      <IconLogo className="h-4 w-4" />
    </div>
  );
}

/** Reveals the answer word by word. */
function useTypewriter(text: string, enabled: boolean, onDone?: () => void) {
  const [shown, setShown] = useState(enabled ? "" : text);
  useEffect(() => {
    if (!enabled) {
      setShown(text);
      return;
    }
    const words = text.split(/(\s+)/);
    let i = 0;
    const step = Math.max(1, Math.ceil(words.length / 90));
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
  const refused = a.kind === "refused";
  return (
    <div className="flex items-start gap-2">
      <Avatar />
      <div className={`max-w-[88%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed ${refused ? "bg-bad-soft text-ink" : "bg-gray-soft text-ink"}`}>
        <p className="whitespace-pre-line">{shown}</p>
        {shown.length >= a.answer.length && (
          <div className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${refused ? "text-bad" : "text-ok"}`}>
            {refused ? <IconLock className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
            {refused ? "Blocked for privacy" : "Checked against your report"}
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
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLog([]);
  }, [source]);
  const toBottom = () => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  useEffect(() => {
    toBottom();
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
    <Card id="ask" title="Ask about your report" icon={<IconChat />} className="no-print">
      <div ref={listRef} className="max-h-[380px] min-h-[140px] space-y-3 overflow-y-auto pr-1">
        {log.length === 0 && (
          <div>
            <div className="flex items-start gap-2">
              <Avatar />
              <div className="rounded-2xl rounded-tl-md bg-gray-soft px-3.5 py-2.5 text-sm text-ink">
                Hi! I can explain any result on this report in simple words. What would you like to know?
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-9">
              {suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink transition hover:border-brand/40 hover:bg-brand-soft">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md bg-navy px-3.5 py-2.5 text-sm text-white">{m.q}</div>
            {m.a && <BotMessage a={m.a} animate={i === log.length - 1} onDone={toBottom} />}
            {m.err && <div className="text-sm text-bad">{m.err}</div>}
            {!m.a && !m.err && (
              <div className="flex items-center gap-2">
                <Avatar />
                <div className="flex gap-1 rounded-2xl rounded-tl-md bg-gray-soft px-3.5 py-3">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="mt-4 flex items-center gap-2 rounded-full border border-line bg-panel py-1 pr-1 pl-4 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} placeholder="Type your question…" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none" />
        <button disabled={busy || !q.trim()} aria-label="Send" className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white transition hover:opacity-90 disabled:opacity-40">
          <IconSend />
        </button>
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

function StatTile({ label, value, tone, icon }: { label: string; value: number; tone: "brand" | "ok" | "warn" | "bad"; icon: React.ReactNode }) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
  };
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</div>
    </div>
  );
}

const FEATURES = [
  { icon: <IconFlask className="h-5 w-5" />, title: "Accurate results", text: "Every test is compared with the lab's normal range for your age and sex." },
  { icon: <IconPulse className="h-5 w-5" />, title: "Plain language", text: "Each result is explained in simple words anyone can follow." },
  { icon: <IconShield className="h-5 w-5" />, title: "Private and safe", text: "Only your report is used, and we never give a diagnosis." },
];

export default function LabLensApp() {
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [overrides, setOverrides] = useState<{ age?: number; sex?: Sex }>({});
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState(0);
  const [uploadKey, setUploadKey] = useState(0);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/patients").then((r) => r.json()).then(setPatients).catch(() => setError("Could not load the report list."));
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

  const goToApp = (then: "open" | "upload") => {
    appRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (then === "open") setOpenKey((k) => k + 1);
    else setUploadKey((k) => k + 1);
  };

  const ex = data?.explanation;
  const textFor = (id: string) => ex?.explanations.find((e) => e.id === id);
  const activeId = source && "patientId" in source ? source.patientId : null;
  const s = data?.summary;
  const attention = s ? s.low + s.high + s.abnormal : 0;
  const pending = s ? s.needs_info + s.cannot_classify : 0;

  return (
    <div className="relative min-h-screen">
      {!data && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="hero-glow" />
        </div>
      )}
      {/* Top navigation */}
      <header className="no-print sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><IconLogo /></span>
            <span className="text-lg font-bold tracking-tight text-ink">LabLens</span>
          </a>
          <nav className="hidden items-center gap-1 rounded-full border border-line bg-panel p-1 text-sm md:flex">
            {(data
              ? [["Results", "#results"], ["Ask", "#ask"], ["Doctor questions", "#questions"]]
              : [["Home", "#top"], ["How it works", "#how"], ["Privacy", "#privacy"]]
            ).map(([label, href], i) => (
              <a key={label} href={href} className={`rounded-full px-4 py-1.5 font-medium transition ${i === 0 ? "bg-bg text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <StatusPill />
            <button onClick={() => goToApp("open")} className="rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-brand/40">
              Open a report
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      {!data && (
        <section id="top" className="relative">
          <div className="relative mx-auto max-w-4xl px-4 pt-16 pb-12 text-center sm:pt-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-brand shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Lab results, made clear
            </span>
            <h1 className="mx-auto mt-5 max-w-3xl text-4xl leading-[1.08] font-extrabold sm:text-6xl">Understand Your Lab Report In Plain Language</h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-body sm:text-lg">
              See what every number means, what is normal for you, and what to ask your doctor, all in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => goToApp("open")} className="group inline-flex items-center gap-3 rounded-full bg-navy py-2 pr-2 pl-6 text-sm font-semibold text-white shadow-frame transition hover:bg-ink">
                Choose a report
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand transition group-hover:translate-x-0.5"><IconArrowRight /></span>
              </button>
              <button onClick={() => goToApp("upload")} className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-5 py-3 text-sm font-semibold text-ink shadow-sm transition hover:border-brand/40">
                <IconUpload /> Upload your own
              </button>
            </div>
          </div>
        </section>
      )}

      {/* App frame */}
      <div ref={appRef} className="relative mx-auto max-w-7xl scroll-mt-20 px-4 pb-16 sm:px-6">
        <div className={`rounded-[28px] border border-line bg-panel/70 p-2 shadow-frame backdrop-blur sm:p-3 ${data ? "mt-6" : ""}`}>
          <div className="grid gap-3 lg:grid-cols-[272px_1fr]">
            {/* Sidebar */}
            <aside className="no-print flex flex-col gap-4 rounded-[20px] border border-line bg-panel p-4">
              <ReportPicker
                patients={patients}
                activeId={activeId}
                uploadedName={activeId ? null : uploadedName}
                openKey={openKey}
                uploadKey={uploadKey}
                onPick={(id) => run({ patientId: id })}
                onText={(text, name) => {
                  setUploadedName(name);
                  run({ reportText: text, fileName: name });
                }}
              />
              {data && (
                <nav className="space-y-0.5 border-t border-line pt-4 text-sm">
                  {[
                    ["Results", "#results", <IconFlask key="f" />],
                    ["Ask about your report", "#ask", <IconChat key="c" />],
                    ["Body overview", "#body", <IconBody key="b" />],
                    ["Doctor questions", "#questions", <IconStethoscope key="s" />],
                  ].map(([label, href, icon]) => (
                    <a key={href as string} href={href as string} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium text-body transition hover:bg-gray-soft hover:text-ink">
                      <span className="text-muted">{icon}</span>
                      {label}
                    </a>
                  ))}
                </nav>
              )}
              <div id="privacy" className="mt-auto flex items-start gap-2.5 rounded-xl bg-gray-soft p-3 text-xs">
                <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>Your report stays private. Only the report you open is used.</span>
              </div>
            </aside>

            {/* Main */}
            <main className="min-w-0 space-y-4 rounded-[20px] bg-bg/60 p-2 sm:p-4">
              {!data && !loading && !error && (
                <div id="how" className="space-y-4">
                  <div className="rounded-2xl border border-line bg-panel p-6 shadow-soft sm:p-8">
                    <h2 className="text-2xl font-bold">Get started</h2>
                    <p className="mt-1 text-body">Choose a report from the list, or upload your own. Your results appear here.</p>
                    <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                      {["Choose or upload a report", "Read your results in simple words", "Ask questions and prepare for your doctor"].map((t, i) => (
                        <li key={t} className="flex items-start gap-3 rounded-xl border border-line p-4">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
                          <span className="text-sm font-medium text-ink">{t}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {FEATURES.map((f) => (
                      <div key={f.title} className="rounded-2xl border border-line bg-panel p-5 shadow-soft">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">{f.icon}</span>
                        <h3 className="mt-3 font-semibold">{f.title}</h3>
                        <p className="mt-1 text-sm">{f.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loading && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-panel" />)}
                  </div>
                  <div className="h-64 animate-pulse rounded-2xl bg-panel" />
                  <p className="text-center text-sm text-muted">Preparing your results…</p>
                </div>
              )}

              {error && !loading && <div className="rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm font-medium text-bad">{error}</div>}

              {data && !loading && (
                <>
                  {/* Report header */}
                  <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-xs font-medium text-muted">
                        Report {data.patient.id}
                        {data.patient.issued ? ` · Issued ${data.patient.issued}` : ""}
                      </div>
                      <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">{data.patient.name ?? "Your report"}</h1>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                        {(["age", "sex"] as const).map((k) => {
                          const d = data.patient[k];
                          return (
                            <span key={k} className={`rounded-full px-2.5 py-1 ${d.value === null ? "bg-info-soft text-info" : "border border-line bg-panel text-ink"}`}>
                              {k === "age" ? "Age" : "Sex"}: {d.value ?? "Not provided"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <GhostButton onClick={() => speak(ex?.explanations.map((e) => e.text).join(" ") ?? "")}>
                        <IconSpeaker /> Listen
                      </GhostButton>
                      <GhostButton onClick={() => window.print()}>
                        <IconPrint /> Print summary
                      </GhostButton>
                    </div>
                  </div>

                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatTile label="Tests on report" value={data.results.length} tone="brand" icon={<IconFlask />} />
                    <StatTile label="In normal range" value={s!.normal} tone="ok" icon={<IconCheck />} />
                    <StatTile label="Need attention" value={attention + pending} tone="warn" icon={<IconPulse />} />
                    <StatTile label="Urgent" value={s!.urgent} tone="bad" icon={<IconAlert />} />
                  </div>

                  {ex?.urgentWarning && (
                    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad-soft p-5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad text-white"><IconAlert className="h-5 w-5" /></span>
                      <div>
                        <div className="text-lg font-bold text-bad">Please see a doctor today</div>
                        <p className="mt-0.5 text-sm text-ink">{ex.urgentWarning}</p>
                      </div>
                    </div>
                  )}

                  {data.needsInfo.length > 0 && source && <NeedsInfoForm missing={data.needsInfo} onSubmit={(v) => run(source, { ...overrides, ...v })} />}

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                    {/* Right column first on small screens so the chat is near the top */}
                    <div className="order-first space-y-4 xl:order-last">
                      <div className="space-y-4 xl:sticky xl:top-20">
                        {source && <ChatBox source={source} overrides={overrides} />}
                        <Card id="body" title="Body overview" icon={<IconBody />}>
                          <BodyMap results={data.results} />
                        </Card>
                      </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <Card id="results" title="Your results" icon={<IconFlask />}>
                        <ul className="space-y-3">
                          {data.results.map((r) => (
                            <ResultRow key={r.id} r={r} text={textFor(r.id)?.text} />
                          ))}
                        </ul>
                        {data.results.length === 0 && <p className="text-muted">No test results were found in this report.</p>}
                      </Card>

                      <Card id="questions" title="Questions to ask your doctor" icon={<IconStethoscope />}>
                        <ol className="space-y-2.5">
                          {ex?.questions.map((q, i) => (
                            <li key={i} className="flex gap-3 text-ink">
                              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
                              <span>{q}</span>
                            </li>
                          ))}
                        </ol>
                        <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-sm text-muted">
                          <IconInfo className="mt-0.5 h-4 w-4 shrink-0" />
                          {data.safetyNote}
                        </p>
                      </Card>
                    </div>
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
