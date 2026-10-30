interface ImageSlotProps {
  /** Photo URL. Photos will come from the Platform Admin upload area; until
   *  then the slot renders the route artwork instead. */
  src?: string | null;
  alt?: string;
  className?: string;
}

/** A photo slot that degrades to decorative route artwork when no image has
 *  been uploaded yet, so the layout never depends on photography existing. */
export function ImageSlot({ src, alt = '', className = '' }: ImageSlotProps) {
  if (src) {
    return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
  }
  return <RouteArt className={className} />;
}

function RouteArt({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 400 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`h-full w-full ${className}`}
    >
      <rect width="400" height="520" fill="#0f2a4a" />
      <g fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5">
        <ellipse cx="300" cy="150" rx="40" ry="28" />
        <ellipse cx="300" cy="150" rx="90" ry="62" />
        <ellipse cx="300" cy="150" rx="150" ry="104" />
        <ellipse cx="300" cy="150" rx="215" ry="148" />
        <ellipse cx="300" cy="150" rx="285" ry="196" />
        <ellipse cx="80" cy="440" rx="60" ry="40" />
        <ellipse cx="80" cy="440" rx="125" ry="84" />
        <ellipse cx="80" cy="440" rx="200" ry="134" />
      </g>
      <path
        d="M70 440 C 140 330, 90 250, 190 210 S 330 170, 305 148"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeDasharray="2 12"
        strokeLinecap="round"
      />
      <circle cx="70" cy="440" r="9" fill="#ffffff" />
      <circle cx="305" cy="148" r="11" fill="#06b6d4" />
      <circle cx="305" cy="148" r="22" fill="none" stroke="#06b6d4" strokeOpacity="0.5" strokeWidth="2" />
    </svg>
  );
}
