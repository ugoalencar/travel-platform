export interface Advisory {
  packageName: string;
  severity: string;
  ghsaId: string | null;
  title: string;
  url: string;
}

export interface AcceptedFinding {
  packageName: string;
  ghsaId: string;
  adr: string;
  reason: string;
}

export interface ClassifiedAdvisories {
  accepted: Array<{ advisory: Advisory; acceptedEntry: AcceptedFinding }>;
  unaccepted: Advisory[];
}

export const AUDIT_LEVEL: string;
export const AUDIT_LEVEL_RANK: Record<string, number>;
export const ACCEPTED_FINDINGS: AcceptedFinding[];

export function findAcceptedEntry(
  packageName: string,
  ghsaId: string,
): AcceptedFinding | undefined;
export function extractGhsaId(url: string | undefined): string | null;
export function collectAdvisories(auditReport: unknown): Advisory[];
export function classifyAdvisories(
  advisories: Advisory[],
  auditLevel?: string,
): ClassifiedAdvisories;
