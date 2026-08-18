export interface SecretPattern {
  name: string;
  kind: 'keyword-value' | 'self-describing' | 'marker';
  regex: RegExp;
}

export interface SecretFinding {
  pattern: string;
  entropy: number | null;
}

export function evaluateLine(line: string): SecretFinding[];
export function isKnownPlaceholder(value: string): boolean;
export function isLikelySecretValue(value: string): boolean;
export function shannonEntropy(value: string): number;
export const patterns: SecretPattern[];
