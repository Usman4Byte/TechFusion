export type Sex = "Male" | "Female";

/** Where a fact came from: file name + 1-based line number. */
export interface SourceRef {
  file: string;
  line: number;
}

export interface RawTest {
  rawName: string;
  /** Numeric value, if the result is a number. */
  value: number | null;
  /** Qualitative value such as "Negative", if not numeric. */
  textValue: string | null;
  /** Value exactly as written in the report. */
  rawValue: string;
  unit: string | null;
  source: SourceRef;
}

export interface Demographic<T> {
  value: T | null;
  /** The text as written (e.g. "[DATA CORRUPTED]"). */
  raw: string | null;
  source: SourceRef | null;
  /** True when the value came from the user, not the report. */
  providedByUser?: boolean;
}

export interface Report {
  patientId: string;
  name: string | null;
  mrn: string | null;
  issued: string | null;
  age: Demographic<number>;
  sex: Demographic<Sex>;
  tests: RawTest[];
  file: string;
}

export interface RangeRow {
  test: string; // canonical name
  sex: Sex | "All";
  ageMin: number;
  ageMax: number;
  low: number | null;
  high: number | null;
  /** For qualitative ranges such as "Negative". */
  expectedText: string | null;
  unit: string | null;
  source: SourceRef;
}

export interface CriticalRow {
  test: string;
  direction: "below" | "above";
  threshold: number;
  unit: string;
  source: SourceRef;
}

export interface AliasRow {
  alias: string;
  canonical: string;
  source: SourceRef;
}

export interface SafetyRule {
  id: number;
  title: string;
  text: string;
  source: SourceRef;
}

export interface KnowledgeBase {
  ranges: RangeRow[];
  critical: CriticalRow[];
  aliases: AliasRow[];
  safety: SafetyRule[];
  /** Exact-on-limit values count as normal (from the range sheet rule). */
  boundaryRule: { inclusive: boolean; source: SourceRef | null; text: string };
  /** "hit or pass" wording means a value equal to the threshold is urgent. */
  criticalRule: { inclusive: boolean; source: SourceRef | null; text: string };
  canonicalTests: string[];
}

export type Status =
  | "normal"
  | "low"
  | "high"
  | "abnormal"
  | "urgent"
  | "needs_info"
  | "cannot_classify";

export interface EvidenceStep {
  label: string;
  detail: string;
  source?: SourceRef;
}

export interface TestResult {
  id: string; // stable id, e.g. "t0"
  rawName: string;
  canonical: string | null;
  rawValue: string;
  value: number | null;
  textValue: string | null;
  unit: string | null;
  converted: { value: number; unit: string; formula: string } | null;
  range: RangeRow | null;
  status: Status;
  /** Direction of the range result when status is urgent. */
  rangeStatus: "normal" | "low" | "high" | "abnormal" | null;
  urgent: CriticalRow | null;
  missing: ("age" | "sex")[];
  reason: string;
  evidence: EvidenceStep[];
  source: SourceRef;
}

export interface Analysis {
  patientId: string;
  name: string | null;
  age: Demographic<number>;
  sex: Demographic<Sex>;
  results: TestResult[];
  needsInfo: ("age" | "sex")[];
  hasUrgent: boolean;
  summary: Record<Status, number>;
}
