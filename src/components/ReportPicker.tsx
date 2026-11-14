"use client";

import { useEffect, useRef, useState } from "react";

export interface PatientItem {
  id: string;
  initials: string;
  tests: number;
}

const MAX_BYTES = 600_000;
const ACCEPT = ".md,.txt,.markdown,.csv,.text";

export function ReportPicker({
  patients,
  activeId,
  uploadedName,
  onPick,
  onText,
}: {
  patients: PatientItem[];
  activeId: string | null;
  uploadedName: string | null;
  onPick: (id: string) => void;
  onText: (text: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<"none" | "upload" | "paste">("none");
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const active = patients.find((p) => p.id === activeId);
  const shown = patients.filter((p) => `${p.id} ${p.initials}`.toLowerCase().includes(filter.toLowerCase()));

  const readFile = async (f: File) => {
    setFileError(null);
    if (f.size > MAX_BYTES) return setFileError("File is too large (max 600 KB).");
    if (!/\.(md|markdown|txt|text|csv)$/i.test(f.name) && !f.type.startsWith("text/")) {
      return setFileError("Please upload a text report (.md, .txt or .csv).");
    }
    const text = await f.text();
    if (!text.trim()) return setFileError("This file is empty.");
    onText(text, f.name);
    setMode("none");
  };

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <label className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">Choose a report</label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-left hover:border-brand/60 focus:border-brand focus:outline-none"
        >
          <span className="min-w-0 truncate">
            {active ? (
              <>
                <span className="font-mono text-xs text-muted">{active.id}</span>
                <span className="ml-2 font-semibold">{active.initials}</span>
                <span className="ml-2 text-xs text-muted">{active.tests} test{active.tests === 1 ? "" : "s"}</span>
              </>
            ) : uploadedName ? (
              <span className="font-semibold">📄 {uploadedName}</span>
            ) : (
              <span className="text-muted">Select a patient report…</span>
            )}
          </span>
          <svg className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-xl">
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search ID or initials…"
                className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
              {shown.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === activeId}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.id);
                      setOpen(false);
                      setFilter("");
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-soft ${p.id === activeId ? "bg-brand-soft" : ""}`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-soft text-xs font-bold">{p.initials}</span>
                    <span className="flex-1">
                      <span className="font-mono text-xs text-muted">{p.id}</span>
                      <span className="block text-xs text-muted">{p.tests} test{p.tests === 1 ? "" : "s"}</span>
                    </span>
                    {p.id === activeId && <span className="text-brand">✓</span>}
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">No matching reports.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or use your own report
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "upload" ? "none" : "upload")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === "upload" ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-soft"}`}
        >
          ⬆ Upload
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "paste" ? "none" : "paste")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === "paste" ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-soft"}`}
        >
          📋 Paste
        </button>
      </div>

      {mode === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) readFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center text-sm transition ${dragging ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-soft"}`}
        >
          <div className="text-2xl">📄</div>
          <div className="mt-1 font-medium">Drop a report here or click to browse</div>
          <div className="mt-0.5 text-xs text-muted">.md, .txt or .csv · up to 600 KB</div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {fileError && <p className="text-xs text-bad">{fileError}</p>}

      {mode === "paste" && (
        <div className="space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            placeholder={"Patient Full Name: …\nRecorded Age: 40\nBiological Sex: Female\n\nHemoglobin: 11.2 g/dL\nSGPT: 60 U/L"}
            className="w-full rounded-lg border border-line bg-panel p-2 font-mono text-xs focus:border-brand focus:outline-none"
          />
          <button
            disabled={!pasted.trim()}
            onClick={() => {
              onText(pasted, "Pasted report");
              setMode("none");
            }}
            className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Explain this report
          </button>
        </div>
      )}
    </div>
  );
}
