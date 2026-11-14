/**
 * Lab Report Explainer brand mark: a report page with text lines, a trend
 * curve and rising bars. Drawn as SVG so it stays crisp at every size.
 */
const INK = "#111318";
const BLUE = "#0f62e6";

export function LogoMark({ className = "h-9 w-9", mono }: { className?: string; mono?: string }) {
  const ink = mono ?? INK;
  const blue = mono ?? BLUE;
  return (
    <svg viewBox="-12 -12 364 382" className={className} role="img" aria-label="Lab Report Explainer logo">
      {/* page outline, open on the right where the curve passes */}
      <path
        d="M297 140V80L218 0H32Q0 0 0 32V325Q0 357 32 357H265Q297 357 297 325V200"
        fill="none"
        stroke={ink}
        strokeWidth="19"
        strokeLinejoin="round"
      />
      {/* folded corner */}
      <path d="M212 0H220L297 77V86H222Q212 86 212 76Z" fill={ink} />
      {/* text lines */}
      <g stroke={ink} strokeWidth="15" strokeLinecap="round">
        <path d="M60 78H166" />
        <path d="M60 121H166" />
        <path d="M60 161H126" />
      </g>
      {/* trend curve */}
      <path d="M56 240C110 262 150 222 186 176C222 130 258 128 300 160C316 172 326 184 338 186" fill="none" stroke={blue} strokeWidth="15" strokeLinecap="round" />
      {/* bars */}
      <g fill={blue}>
        <rect x="117" y="277" width="28" height="32" rx="2" />
        <rect x="167" y="247" width="28" height="62" rx="2" />
        <rect x="217" y="217" width="28" height="92" rx="2" />
      </g>
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className="flex flex-col text-left leading-[1.02]">
        <span className="text-[17px] font-extrabold tracking-tight" style={{ color: INK }}>Lab Report</span>
        <span className="text-[17px] font-extrabold tracking-tight" style={{ color: BLUE }}>Explainer</span>
      </span>
    </span>
  );
}
