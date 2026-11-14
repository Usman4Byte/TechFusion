import type { KnowledgeBase, Report } from "../types";
import { CORPUS } from "./corpus.generated";
import { buildKnowledgeBase } from "./parseKnowledge";
import { parseReport } from "./parseReport";

let cache: { kb: KnowledgeBase; reports: Report[] } | null = null;

import { isPatientReport as isReport } from "./text";

/** Parses the bundled corpus once per server instance. */
export function getCorpus() {
  if (!cache) {
    const kb = buildKnowledgeBase(CORPUS);
    const reports = CORPUS.filter((f) => isReport(f.content)).map((f) => parseReport(f.content, f.name));
    cache = { kb, reports };
  }
  return cache;
}

export function getKnowledgeBase(): KnowledgeBase {
  return getCorpus().kb;
}

export function findReport(patientId: string): Report | undefined {
  return getCorpus().reports.find((r) => r.patientId.toLowerCase() === patientId.trim().toLowerCase());
}

/** Reference files only (used to show citations). */
export function referenceFiles(): string[] {
  return CORPUS.filter((f) => !isReport(f.content)).map((f) => f.name);
}
