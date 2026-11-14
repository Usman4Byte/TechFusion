"use client";

import type { Status, TestResult } from "@/lib/types";

export const STATUS_STYLE: Record<Status, { label: string; cls: string; dot: string }> = {
  normal: { label: "Normal", cls: "bg-ok-soft text-ok", dot: "bg-ok" },
  low: { label: "Low", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  high: { label: "High", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  abnormal: { label: "Not as expected", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  urgent: { label: "Urgent", cls: "bg-bad-soft text-bad", dot: "bg-bad" },
  needs_info: { label: "Needs info", cls: "bg-info-soft text-info", dot: "bg-info" },
  cannot_classify: { label: "Cannot be classified", cls: "bg-gray-soft text-muted", dot: "bg-muted" },
};

export function StatusChip({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : String(n));

/** Bar with low / normal / high zones and a marker at the patient's value. */
export function RangeGauge({ r }: { r: TestResult }) {
  if (!r.range || r.range.low === null || r.range.high === null) return null;
  const v = r.converted?.value ?? r.value;
  if (v === null) return null;
  const { low, high } = r.range;
  const span = high - low || 1;
  const min = Math.min(low - span * 0.5, v);
  const max = Math.max(high + span * 0.5, v);
  const pct = (x: number) => ((x - min) / (max - min)) * 100;
  const marker = Math.min(98, Math.max(2, pct(v)));
  const urgentT = r.urgent?.threshold;
  return (
    <div className="mt-2" aria-label={`Value ${v} on range ${low} to ${high}`}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-warn-soft">
        <div className="absolute inset-y-0 bg-ok-soft" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
        {urgentT !== undefined && (
          <div className="absolute inset-y-0 w-0.5 bg-bad" style={{ left: `${pct(urgentT)}%` }} />
        )}
      </div>
      <div className="relative h-4">
        <div
          className={`absolute -top-[14px] h-4 w-1.5 -translate-x-1/2 rounded-sm ring-2 ring-panel ${STATUS_STYLE[r.status].dot}`}
          style={{ left: `${marker}%` }}
        />
        <span className="absolute top-0.5 -translate-x-1/2 text-[10px] text-muted" style={{ left: `${pct(low)}%` }}>{fmt(low)}</span>
        <span className="absolute top-0.5 -translate-x-1/2 text-[10px] text-muted" style={{ left: `${pct(high)}%` }}>{fmt(high)}</span>
      </div>
    </div>
  );
}

export function Card({ title, children, right, className = "" }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
