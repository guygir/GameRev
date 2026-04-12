export function CoverArtAnthropic() {
  return (
    <svg
      viewBox="0 0 320 420"
      className="h-full w-full"
      role="img"
      aria-label="Abstract cover treatment for Signalis"
    >
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b1f18" />
          <stop offset="0.45" stopColor="#4a2418" />
          <stop offset="1" stopColor="#0b0a12" />
        </linearGradient>
        <radialGradient id="g2" cx="30%" cy="25%" r="70%">
          <stop offset="0" stopColor="#f0c987" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f0c987" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="420" fill="url(#g1)" />
      <rect width="320" height="420" fill="url(#g2)" />
      <path
        d="M-20 260 L120 120 L260 300 L340 180 L360 460 L-40 460 Z"
        fill="#120c10"
        opacity="0.55"
      />
      <path
        d="M40 380 L140 200 L220 320 L300 240 L320 420 L20 420 Z"
        fill="#c17a3a"
        opacity="0.22"
      />
      <circle cx="250" cy="90" r="46" fill="none" stroke="#f4e9d8" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="250" cy="90" r="28" fill="none" stroke="#f4e9d8" strokeOpacity="0.18" strokeWidth="1" />
    </svg>
  )
}

export function CoverArtLight() {
  return (
    <svg
      viewBox="0 0 360 420"
      className="h-full w-full"
      role="img"
      aria-label="Minimal cover for Signalis"
    >
      <rect width="360" height="420" fill="#ffffff" />
      <rect x="0" y="0" width="360" height="10" fill="#111827" />
      <path d="M0 420 L120 160 L220 280 L360 120 L360 420 Z" fill="#e5e7eb" />
      <path
        d="M0 420 L160 220 L280 320 L360 200 L360 420 Z"
        fill="#8251ee"
        opacity="0.12"
      />
      <rect x="28" y="36" width="110" height="12" rx="2" fill="#111827" opacity="0.85" />
      <rect x="28" y="58" width="180" height="8" rx="2" fill="#64748b" opacity="0.45" />
    </svg>
  )
}
