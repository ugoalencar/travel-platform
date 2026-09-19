// Client for the Platform Admin Commercial public read API
// (services/api/src/platform-routes.ts -- registerPublicPlatformRoutes).
// Bare `/public/...` paths, no auth, matching the existing
// fetch('/public/leads') convention in DemoRequest.tsx/TrialSignup.tsx --
// see apps/marketing/vite.config.ts's dev proxy and
// infrastructure/Caddyfile.local-staging's www.localhost block, both of
// which forward /public/* to the API as-is (no /api prefix).
//
// These endpoints only ever return PUBLISHED/is_public/ACTIVE-in-window
// content (enforced server-side, see platform-commercial.ts) -- this
// client never has a way to request draft content, by construction.

export interface PublicLandingSection {
  id: string;
  type: string;
  enabled: boolean;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface PublicLandingPage {
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  ctaPrimaryLabel: string | null;
  ctaPrimaryUrl: string | null;
  ctaSecondaryLabel: string | null;
  ctaSecondaryUrl: string | null;
  footerContent: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
}

export interface PublicLanding {
  publishedAt: string;
  page: PublicLandingPage;
  sections: PublicLandingSection[];
}

export interface PublicPartner {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string;
  description: string | null;
  websiteUrl: string | null;
  featured: boolean;
}

export interface PublicBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sortOrder: number;
}

// Every call below fails soft (returns null/[] on any error) -- a public
// marketing page must never break because the commercial API is slow,
// unreachable, or has nothing published yet (spec: "usar fallback seguro
// mínimo, sem quebrar a página").

export async function getPublicLanding(): Promise<PublicLanding | null> {
  try {
    const response = await fetch('/public/landing');
    if (!response.ok) return null;
    const data = (await response.json()) as { landing: PublicLanding | null };
    return data.landing;
  } catch {
    return null;
  }
}

export async function getPublicPartners(): Promise<PublicPartner[]> {
  try {
    const response = await fetch('/public/partners');
    if (!response.ok) return [];
    const data = (await response.json()) as { partners: PublicPartner[] };
    return data.partners;
  } catch {
    return [];
  }
}

export async function getPublicBanners(placement: 'LANDING' | 'PLATFORM_ADMIN' = 'LANDING'): Promise<PublicBanner[]> {
  try {
    const response = await fetch(`/public/banners?placement=${placement}`);
    if (!response.ok) return [];
    const data = (await response.json()) as { banners: PublicBanner[] };
    return data.banners;
  } catch {
    return [];
  }
}

// Defense in depth: the backend already rejects unsafe URLs at write time
// (assertSafeExternalUrl in platform-commercial.ts), but this renderer
// never trusts a stored value blindly for something as sensitive as an
// outbound link -- only a real absolute http(s) URL or a site-internal
// path is ever rendered as a real `href`; anything else is dropped.
export function isSafeHref(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
