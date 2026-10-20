/* Travel Plataforma logo (Bússola). Wordmark is drawn as single-stroke
   geometric glyphs so it renders identically without any installed font. */

const GLYPHS: Record<string, string> = {
  T: 'M0 1H10M5 1V14',
  R: 'M1 14V1H6A3.5 3.5 0 0 1 6 8H1M6 8L10 14',
  A: 'M0 14L5 1L10 14M2 9H8',
  V: 'M0 1L5 14L10 1',
  E: 'M9 1H1V14H9M1 7.5H8',
  L: 'M1 1V14H9',
  P: 'M1 14V1H6A3.5 3.5 0 0 1 6 8H1',
  F: 'M9 1H1V14M1 7.5H8',
  O: 'M5 1A4.4 6.5 0 1 0 5.01 1Z',
  M: 'M1 14V1L5 9L9 1V14',
};

const SCALE = 1.5;
const ADVANCE = 14 * SCALE;
const WORD_X = 84;
const NAVY = '#0f2a4a';
const COBALT = '#1554d1';
const WHITE = '#ffffff';
const FULL_WIDTH = 290;

function Word({ text, y }: { text: string; y: number }) {
  return (
    <>
      {[...text].map((letter, index) => (
        <path
          key={index}
          transform={`translate(${WORD_X + index * ADVANCE} ${y}) scale(${SCALE})`}
          d={GLYPHS[letter]}
        />
      ))}
    </>
  );
}

interface LogoProps {
  /** Background the logo sits on: "light" uses the navy wordmark, "dark" the white one. */
  tone?: 'light' | 'dark';
  /** Only the compass square, without the wordmark. */
  iconOnly?: boolean;
  className?: string;
}

export function Logo({ tone = 'light', iconOnly = false, className = 'h-10' }: LogoProps) {
  const onDark = tone === 'dark';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${iconOnly ? 64 : FULL_WIDTH} 64`}
      role="img"
      aria-label="Travel Plataforma"
      className={className}
    >
      <rect width="64" height="64" fill={onDark ? WHITE : COBALT} />
      <polygon points="32,9 41,32 23,32" fill={onDark ? COBALT : WHITE} />
      <polygon points="23,32 41,32 32,55" fill={NAVY} />
      {!iconOnly && (
        <g
          fill="none"
          stroke={onDark ? WHITE : NAVY}
          strokeWidth="1.75"
          strokeLinecap="square"
          strokeLinejoin="miter"
        >
          <Word text="TRAVEL" y={6} />
          <Word text="PLATAFORMA" y={37} />
        </g>
      )}
    </svg>
  );
}
