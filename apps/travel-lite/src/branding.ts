import type { CSSProperties } from 'react';
import { api } from './api';

/**
 * Tenant branding (login + authenticated shell). The API is the authority:
 * everything arriving here is re-validated (strict #RRGGBB, raster data URLs
 * only) so a bad value can never end up in a style attribute or an <img>.
 * `null` fields mean "use the default theme".
 */

export interface Branding {
  displayName: string | null;
  welcomeText: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  loginBackground: string | null;
  logoDataUrl: string | null;
}

export const DEFAULT_BRANDING: Branding = {
  displayName: null,
  welcomeText: null,
  primaryColor: null,
  secondaryColor: null,
  loginBackground: null,
  logoDataUrl: null,
};

export const MAX_LOGO_BYTES = 150 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LAST_SLUG_KEY = 'travel_lite_last_slug';
const RESERVED_SUBDOMAINS = new Set(['api', 'app', 'www']);
const RESERVED_PATH_SEGMENTS = new Set([
  'ajuda',
  'api',
  'cadastros',
  'clientes',
  'comissoes',
  'configuracoes',
  'financeiro',
  'forgot-password',
  'importacoes',
  'login',
  'plano',
  'relatorios',
  'reset-password',
  'vendas',
  'vendedores',
]);

export function safeColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value.toLowerCase() : null;
}

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text !== '' && text.length <= max ? text : null;
}

/** Defensive parse of whatever the API (or a stale cache) returned. */
export function normalizeBranding(raw: unknown): Branding {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_BRANDING };
  const source = raw as Record<string, unknown>;
  const logo = source['logoDataUrl'];
  return {
    displayName: safeText(source['displayName'], 80),
    welcomeText: safeText(source['welcomeText'], 160),
    primaryColor: safeColor(source['primaryColor']),
    secondaryColor: safeColor(source['secondaryColor']),
    loginBackground: safeColor(source['loginBackground']),
    logoDataUrl: typeof logo === 'string' && LOGO_DATA_URL_RE.test(logo) ? logo : null,
  };
}

/** Darker shade used for hover states (amount 0..1). */
export function darken(hex: string, amount = 0.18): string {
  const channel = (start: number) =>
    Math.max(0, Math.round(Number.parseInt(hex.slice(start, start + 2), 16) * (1 - amount)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** CSS variables for the colors that are set; the rest keeps the stylesheet defaults. */
export function brandingVars(branding: Branding): Record<string, string> {
  const vars: Record<string, string> = {};
  if (branding.primaryColor) {
    vars['--lite-primary'] = branding.primaryColor;
    vars['--lite-primary-dark'] = darken(branding.primaryColor);
  }
  if (branding.secondaryColor) vars['--lite-sidebar'] = branding.secondaryColor;
  if (branding.loginBackground) vars['--lite-login-bg'] = branding.loginBackground;
  return vars;
}

export function brandingStyle(branding: Branding): CSSProperties {
  return brandingVars(branding);
}

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value.trim().toLowerCase());
}

export function slugFromHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (
    normalized === '' ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.includes(':') ||
    IPV4_RE.test(normalized)
  ) {
    return '';
  }

  const labels = normalized.split('.').filter(Boolean);
  if (normalized.endsWith('.com.br') && labels.length < 4) return '';
  if (labels.length < 3) return '';
  const candidate = labels[0] ?? '';
  if (RESERVED_SUBDOMAINS.has(candidate)) return '';
  return isValidSlug(candidate) ? candidate : '';
}

export function slugFromCurrentHostname(): string {
  return slugFromHostname(window.location.hostname);
}

export function slugFromPathname(pathname: string): string {
  const firstSegment = pathname.split('/').filter(Boolean)[0]?.trim().toLowerCase() ?? '';
  if (firstSegment === '' || RESERVED_PATH_SEGMENTS.has(firstSegment)) return '';
  return isValidSlug(firstSegment) ? firstSegment : '';
}

export function slugFromCurrentPathname(): string {
  return slugFromPathname(window.location.pathname);
}

/** Branding for the login screen. Any failure falls back to the default theme. */
export async function fetchPublicBranding(slug: string): Promise<Branding> {
  const normalized = slug.trim().toLowerCase();
  if (!isValidSlug(normalized)) return { ...DEFAULT_BRANDING };
  try {
    const response = await api<{ branding: unknown }>(
      `/branding/public?slug=${encodeURIComponent(normalized)}`,
      { token: null },
    );
    return normalizeBranding(response.branding);
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

export function rememberSlug(slug: string): void {
  try {
    window.localStorage.setItem(LAST_SLUG_KEY, slug.trim().toLowerCase());
  } catch {
    // Storage can be blocked (private mode); the login still works.
  }
}

export function recallSlug(): string {
  try {
    const stored = window.localStorage.getItem(LAST_SLUG_KEY) ?? '';
    return isValidSlug(stored) ? stored : '';
  } catch {
    return '';
  }
}
