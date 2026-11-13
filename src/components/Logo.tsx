/** Brand mark: a price line stepping down to a marked low. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="6" fill="#1d2126" />
      <path
        d="M6 9h6v6h6v5h8"
        fill="none"
        stroke="#4fd1c5"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="20" r="2.5" fill="#ff9f43" />
    </svg>
  );
}
