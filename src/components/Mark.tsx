export function Mark({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#171c19" />
      <circle cx="30" cy="36" r="16" fill="none" stroke="#2fbf93" strokeWidth="3" />
      <path d="M40 14l10 6-4 11-9-3z" fill="#f0a202" />
      <circle cx="24" cy="42" r="4" fill="#e7efe9" />
    </svg>
  )
}
