import { ValidationError } from './errors';

/**
 * Tenant branding (login + authenticated shell). Pure validation and
 * shaping only; the routes own persistence and authorization.
 *
 * Safety rules:
 * - colors are strict #RRGGBB (never free CSS), and readable against the
 *   white text drawn on top of them;
 * - the logo is a raster image (PNG/JPEG/WebP) whose magic bytes match its
 *   declared type; SVG is refused (active content);
 * - nothing here ever carries a tenant id.
 */

export const MAX_DISPLAY_NAME = 80;
export const MAX_WELCOME_TEXT = 160;
export const MAX_LOGO_BYTES = 150 * 1024;

/** WCAG contrast of the brand colors against the white text on top of them. */
const MIN_PRIMARY_CONTRAST = 3;
const MIN_SECONDARY_CONTRAST = 4.5;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

export type LogoMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** What the API exposes. `null` means "use the default theme". */
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

/** Row shape of tenant_branding as read by the routes. */
export interface BrandingRow {
  display_name: string | null;
  welcome_text: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  login_background: string | null;
  logo_mime: string | null;
  logo_data: Buffer | null;
}

export type LogoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; mime: LogoMime; data: Buffer };

export interface BrandingUpdate {
  displayName: string | null;
  welcomeText: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  loginBackground: string | null;
  logo: LogoChange;
}

function isLogoMime(value: string | null): value is LogoMime {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

/**
 * Rebuilds the API shape from a stored row. Anything that does not pass the
 * same checks as the write path is dropped to `null`, so a bad value in the
 * database can never reach a page or a style attribute.
 */
export function rowToBranding(row: BrandingRow | null | undefined): Branding {
  if (!row) return { ...DEFAULT_BRANDING };
  const color = (value: string | null): string | null =>
    value !== null && HEX_COLOR_RE.test(value) ? value.toLowerCase() : null;
  const logoDataUrl =
    row.logo_data && isLogoMime(row.logo_mime) && row.logo_data.length <= MAX_LOGO_BYTES
      ? `data:${row.logo_mime};base64,${row.logo_data.toString('base64')}`
      : null;
  return {
    displayName: row.display_name,
    welcomeText: row.welcome_text,
    primaryColor: color(row.primary_color),
    secondaryColor: color(row.secondary_color),
    loginBackground: color(row.login_background),
    logoDataUrl,
  };
}

function optionalText(source: Record<string, unknown>, field: string, max: number, label: string): string | null {
  const raw = source[field];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new ValidationError(`${label} deve ser texto`);
  const value = raw.trim();
  if (value === '') return null;
  if (value.length > max) throw new ValidationError(`${label} deve ter no máximo ${max} caracteres`);
  if (CONTROL_CHARS_RE.test(value)) throw new ValidationError(`${label} contém caracteres inválidos`);
  return value;
}

/** Relative luminance (WCAG 2.x) of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Contrast ratio between a color and white. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

function optionalColor(
  source: Record<string, unknown>,
  field: string,
  label: string,
  minContrast: number | null,
): string | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !HEX_COLOR_RE.test(raw)) {
    throw new ValidationError(`${label} deve estar no formato #RRGGBB`);
  }
  const value = raw.toLowerCase();
  if (minContrast !== null && contrastWithWhite(value) < minContrast) {
    throw new ValidationError(`${label} é clara demais: o texto branco ficaria ilegível. Escolha uma cor mais escura`);
  }
  return value;
}

function hasMagicBytes(mime: LogoMime, data: Buffer): boolean {
  if (mime === 'image/png') {
    return data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') {
    return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  return (
    data.length > 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

/** `undefined` keeps the stored logo, `null` removes it, a data URL replaces it. */
function parseLogo(source: Record<string, unknown>): LogoChange {
  if (!('logoDataUrl' in source) || source['logoDataUrl'] === undefined) return { kind: 'keep' };
  const raw = source['logoDataUrl'];
  if (raw === null || raw === '') return { kind: 'remove' };
  if (typeof raw !== 'string') throw new ValidationError('Logo inválido');
  // Cheap guard before the regex runs over a large string.
  if (raw.length > Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 64) {
    throw new ValidationError(`O logo excede ${MAX_LOGO_BYTES / 1024} KB`);
  }
  const match = LOGO_DATA_URL_RE.exec(raw);
  if (!match) throw new ValidationError('Logo deve ser uma imagem PNG, JPEG ou WebP');
  const mime = match[1] as LogoMime;
  const data = Buffer.from(match[2]!, 'base64');
  if (data.length === 0 || data.length > MAX_LOGO_BYTES) {
    throw new ValidationError(`O logo deve ter até ${MAX_LOGO_BYTES / 1024} KB`);
  }
  if (!hasMagicBytes(mime, data)) {
    throw new ValidationError('O conteúdo do arquivo não corresponde ao tipo de imagem informado');
  }
  return { kind: 'set', mime, data };
}

/** The editor sends the whole text/color state; only the logo has a "keep". */
export function parseBrandingUpdate(source: Record<string, unknown>): BrandingUpdate {
  return {
    displayName: optionalText(source, 'displayName', MAX_DISPLAY_NAME, 'Nome fantasia'),
    welcomeText: optionalText(source, 'welcomeText', MAX_WELCOME_TEXT, 'Texto de boas-vindas'),
    primaryColor: optionalColor(source, 'primaryColor', 'Cor primária', MIN_PRIMARY_CONTRAST),
    secondaryColor: optionalColor(source, 'secondaryColor', 'Cor secundária', MIN_SECONDARY_CONTRAST),
    loginBackground: optionalColor(source, 'loginBackground', 'Cor de fundo do login', null),
    logo: parseLogo(source),
  };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

/** Normalized slug, or null when it cannot be a tenant slug. */
export function parseSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slug = value.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}
