export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="6.4 4.2"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="42" y="58" width="16" height="20" rx="3" fill="var(--steel)" />
      <rect x="42" y="63" width="16" height="2.4" fill="var(--bg-raised)" opacity="0.6" />
      <rect x="42" y="69" width="16" height="2.4" fill="var(--bg-raised)" opacity="0.6" />
      <ellipse cx="50" cy="46" rx="13" ry="11" fill="var(--white)" />
      <ellipse cx="39" cy="42" rx="9" ry="7.5" fill="var(--white)" />
      <ellipse cx="61" cy="42" rx="9" ry="7.5" fill="var(--white)" />
      <ellipse cx="50" cy="34" rx="9" ry="7.5" fill="var(--white)" />
      <path d="M50 53 C 46 49, 46 42, 50 38 C 54 42, 54 49, 50 53 Z" fill="currentColor" />
    </svg>
  );
}
