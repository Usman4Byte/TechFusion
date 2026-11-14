/** Small line icons (24px grid, stroke-based). */
type P = { className?: string };
const base = (className = "h-4 w-4") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconLogo = ({ className = "h-5 w-5" }: P) => (
  <svg {...base(className)} strokeWidth={2.2}>
    <circle cx="10.5" cy="10.5" r="5.5" />
    <path d="M14.5 14.5 20 20M8.5 10.5h4M10.5 8.5v4" />
  </svg>
);
export const IconUpload = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);
export const IconPaste = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" />
  </svg>
);
export const IconFile = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);
export const IconChevron = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconSearch = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const IconCheck = ({ className }: P) => (
  <svg {...base(className)} strokeWidth={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconLock = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const IconSpeaker = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const IconPrint = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
    <rect x="7" y="14" width="10" height="6" rx="1" />
  </svg>
);
export const IconSend = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
export const IconAlert = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);
export const IconInfo = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </svg>
);
export const IconFlask = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
    <path d="M7.5 15h9" />
  </svg>
);
export const IconPulse = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);
export const IconChat = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8z" />
    <path d="M9 9h6M9 12h4" />
  </svg>
);
export const IconStethoscope = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2" />
    <circle cx="20" cy="11" r="2" />
  </svg>
);
export const IconBody = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="4.5" r="2" />
    <path d="M7 8.5h10M12 8.5v6M12 14.5 9 21M12 14.5l3 6.5M7 8.5 5.5 13M17 8.5l1.5 4.5" />
  </svg>
);
export const IconShield = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const IconArrowRight = ({ className }: P) => (
  <svg {...base(className)} strokeWidth={2.2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
