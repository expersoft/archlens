export function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg data-icon="info" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

// Lente sobre as três camadas ArchiMate (negócio, aplicação, tecnologia).
export function ArchlensMark({ size = 20 }: { size?: number }) {
  return (
    <svg data-mark="archlens" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="13" cy="13" r="10" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <rect x="7" y="8" width="12" height="2.8" rx="1" fill="var(--biz-s)" />
      <rect x="7" y="11.8" width="12" height="2.8" rx="1" fill="var(--app-s)" />
      <rect x="7" y="15.6" width="12" height="2.8" rx="1" fill="var(--tech-s)" />
      <path d="M20.5 20.5l7 7" stroke="var(--accent)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
