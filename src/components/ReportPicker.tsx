"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevron, IconFile, IconPaste, IconSearch, IconUpload } from "./icons";

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
  openKey = 0,
  uploadKey = 0,
}: {
  patients: PatientItem[];
  activeId: string | null;
  uploadedName: string | null;
  onPick: (id: string) => void;
  onText: (text: string, name: string) => void;
  /** Changing this opens the dropdown (used by the hero buttons). */
  openKey?: number;
  /** Changing this opens the upload panel. */
  uploadKey?: number;
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
    if (openKey) setOpen(true);
  }, [openKey]);
  useEffect(() => {
    if (uploadKey) setMode("upload");
  }, [uploadKey]);

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
    if (f.size > MAX_BYTES) return setFileError("This file is too large (max 600 KB).");
    if (!/\.(md|markdown|txt|text|csv)$/i.test(f.name) && !f.type.startsWith("text/")) {
      return setFileError("Please upload a text report (.md, .txt or .csv).");
    }
    const text = await f.text();
    if (!text.trim()) return setFileError("This file is empty.");
    onText(text, f.name);
    setMode("none");
  };

  const tab = (m: "upload" | "paste") =>
    `inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
      mode === m ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:border-brand/40"
    }`;

  return (
    <div className="space-y-4">
      <div ref={boxRef} className="relative">
        <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-muted uppercase">Patient report</label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-panel px-3 py-2.5 text-left transition ${open ? "border-brand ring-4 ring-brand/10" : "border-line hover:border-brand/40"}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {active ? (
              <>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{active.initials}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{active.id}</span>
                  <span className="block text-[11px] text-muted">{active.tests} test{active.tests === 1 ? "" : "s"}</span>
                </span>
              </>
            ) : uploadedName ? (
              <>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><IconFile className="h-4 w-4" /></span>
                <span className="truncate text-sm font-semibold text-ink">{uploadedName}</span>
              </>
            ) : (
              <span className="text-sm text-muted">Select a report…</span>
            )}
          </span>
          <IconChevron className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-frame">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <IconSearch className="h-4 w-4 text-muted" />
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search by ID or initials"
                className="w-full bg-transparent py-1 text-sm text-ink placeholder:text-muted focus:outline-none"
              />
            </div>
            <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
              {shown.map((p) => (
                <li key={p.id} role="option" aria-selected={p.id === activeId}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.id);
                      setOpen(false);
                      setFilter("");
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-gray-soft ${p.id === activeId ? "bg-brand-soft" : ""}`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-soft text-[11px] font-bold text-ink">{p.initials}</span>
                    <span className="flex-1">
                      <span className="block font-semibold text-ink">{p.id}</span>
                      <span className="block text-[11px] text-muted">{p.tests} test{p.tests === 1 ? "" : "s"}</span>
                    </span>
                    {p.id === activeId && <IconCheck className="h-4 w-4 text-brand" />}
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">No matching reports.</li>}
            </ul>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Your own report</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode(mode === "upload" ? "none" : "upload")} className={tab("upload")}>
            <IconUpload /> Upload
          </button>
          <button type="button" onClick={() => setMode(mode === "paste" ? "none" : "paste")} className={tab("paste")}>
            <IconPaste /> Paste
          </button>
        </div>
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
          className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center text-sm transition ${dragging ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40 hover:bg-gray-soft"}`}
        >
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand"><IconUpload className="h-5 w-5" /></span>
          <div className="mt-2 font-semibold text-ink">Drop your report here</div>
          <div className="mt-0.5 text-xs text-muted">or click to browse · .md, .txt, .csv</div>
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
            rows={7}
            placeholder={"Patient Full Name: …\nRecorded Age: 40\nBiological Sex: Female\n\nHemoglobin: 11.2 g/dL\nSGPT: 60 U/L"}
            className="w-full rounded-xl border border-line bg-panel p-3 font-mono text-xs text-ink focus:border-brand focus:ring-4 focus:ring-brand/10 focus:outline-none"
          />
          <button
            disabled={!pasted.trim()}
            onClick={() => {
              onText(pasted, "Pasted report");
              setMode("none");
            }}
            className="w-full rounded-full bg-navy px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-ink disabled:opacity-40"
          >
            Explain this report
          </button>
        </div>
      )}
    </div>
  );
}
