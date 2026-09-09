// Lightweight "destination art" helper: a deterministic CSS gradient +
// emoji keyed by the destination name, used as a warm stand-in for real
// destination photography across trip cards. No network image loading is
// introduced (no external image-hosting dependency, no extra network
// request/failure mode to test for) -- just a hash over the destination
// string picking from a small curated set of gradients, so the same
// destination always renders the same "hero" treatment.
const GRADIENTS = [
  'from-sky-200 via-cyan-100 to-blue-200',
  'from-orange-200 via-amber-100 to-yellow-200',
  'from-emerald-200 via-teal-100 to-cyan-200',
  'from-fuchsia-200 via-pink-100 to-rose-200',
  'from-violet-200 via-indigo-100 to-blue-200',
  'from-lime-200 via-emerald-100 to-teal-200',
] as const;

const EMOJI_BY_KEYWORD: Array<[RegExp, string]> = [
  [/praia|beach|ilha|island|caribe|maldivas/i, '🏖️'],
  [/montanha|mountain|serra|neve|ski/i, '🏔️'],
  [/cidade|city|nova york|paris|londres|tóquio|tokyo/i, '🏙️'],
  [/floresta|forest|amazônia|amazonia|jungle/i, '🌳'],
  [/deserto|desert/i, '🏜️'],
  [/campo|fazenda|vinícola|vineyard/i, '🌾'],
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function destinationGradient(destination: string): string {
  const hash = hashString(destination || 'destino');
  return GRADIENTS[hash % GRADIENTS.length] ?? GRADIENTS[0];
}

export function destinationEmoji(destination: string): string {
  const match = EMOJI_BY_KEYWORD.find(([pattern]) => pattern.test(destination));
  return match ? match[1] : '🧳';
}
