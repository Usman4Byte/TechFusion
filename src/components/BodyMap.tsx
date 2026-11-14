"use client";

import type { Status, TestResult } from "@/lib/types";

type Organ = "thyroid" | "heart" | "liver" | "sugar" | "kidney" | "blood" | "urine";

const ORGAN_OF: Record<string, Organ> = {
  hemoglobin: "blood",
  whitebloodcellcount: "blood",
  plateletcount: "blood",
  redbloodcellcount: "blood",
  fastingbloodsugar: "sugar",
  alt: "liver",
  ast: "liver",
  cholesterol: "heart",
  tsh: "thyroid",
  urineph: "urine",
  urineprotein: "kidney",
};

const SEVERITY: Status[] = ["normal", "needs_info", "cannot_classify", "low", "high", "abnormal", "urgent"];
const FILL: Partial<Record<Status, string>> = {
  normal: "var(--ok)",
  low: "var(--warn)",
  high: "var(--warn)",
  abnormal: "var(--warn)",
  urgent: "var(--bad)",
  needs_info: "var(--info)",
  cannot_classify: "var(--muted)",
};

const LABEL: Record<Organ, string> = {
  thyroid: "Thyroid",
  heart: "Heart & vessels",
  liver: "Liver",
  sugar: "Blood sugar",
  kidney: "Kidneys",
  blood: "Blood cells",
  urine: "Urine",
};

/** Simple body outline; organs light up by the worst result in their group. */
export function BodyMap({ results }: { results: TestResult[] }) {
  const worst = new Map<Organ, Status>();
  for (const r of results) {
    const organ = r.canonical ? ORGAN_OF[r.canonical.toLowerCase().replace(/[^a-z0-9]/g, "")] : undefined;
    if (!organ) continue;
    const cur = worst.get(organ);
    if (!cur || SEVERITY.indexOf(r.status) > SEVERITY.indexOf(cur)) worst.set(organ, r.status);
  }
  const fill = (o: Organ) => (worst.has(o) ? FILL[worst.get(o)!] : "var(--line)");
  const op = (o: Organ) => (worst.has(o) ? 0.9 : 0.35);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 220" className="h-52 w-auto shrink-0" role="img" aria-label="Body map of tested areas">
        <g fill="none" stroke="var(--muted)" strokeWidth="1.5" opacity="0.6">
          <circle cx="60" cy="22" r="16" />
          <path d="M44 44 Q60 50 76 44 L96 60 Q100 90 92 120 L84 118 L82 80 L80 140 L84 212 L68 212 L62 150 L58 150 L52 212 L36 212 L40 140 L38 80 L36 118 L28 120 Q20 90 24 60 Z" />
        </g>
        {/* thyroid */}
        <ellipse cx="60" cy="46" rx="7" ry="3.5" fill={fill("thyroid")} opacity={op("thyroid")} />
        {/* heart */}
        <path d="M64 66 q4 -6 9 -2 q4 5 -2 10 l-7 7 l-7 -7 q-6 -5 -2 -10 q5 -4 9 2z" fill={fill("heart")} opacity={op("heart")} />
        {/* liver */}
        <path d="M42 86 q14 -6 30 -2 q2 8 -6 12 q-14 4 -24 -2z" fill={fill("liver")} opacity={op("liver")} />
        {/* pancreas / sugar */}
        <ellipse cx="66" cy="100" rx="10" ry="3" fill={fill("sugar")} opacity={op("sugar")} />
        {/* kidneys */}
        <ellipse cx="48" cy="112" rx="4.5" ry="7" fill={fill("kidney")} opacity={op("kidney")} />
        <ellipse cx="72" cy="112" rx="4.5" ry="7" fill={fill("kidney")} opacity={op("kidney")} />
        {/* bladder / urine */}
        <ellipse cx="60" cy="134" rx="6" ry="4.5" fill={fill("urine")} opacity={op("urine")} />
        {/* blood: vessel lines in arms and legs */}
        <g stroke={fill("blood")} strokeWidth="2.5" opacity={op("blood")} strokeLinecap="round">
          <path d="M32 66 L30 112" />
          <path d="M88 66 L90 112" />
          <path d="M48 150 L46 205" />
          <path d="M72 150 L74 205" />
        </g>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {(Object.keys(LABEL) as Organ[]).filter((o) => worst.has(o)).map((o) => (
          <li key={o} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: fill(o) }} />
            <span>{LABEL[o]}</span>
          </li>
        ))}
        {worst.size === 0 && <li className="text-muted">No mapped tests in this report.</li>}
      </ul>
    </div>
  );
}
