// Loading placeholders so a pending state is never a blank screen.

function Bar({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-line ${className}`} />;
}

// Full-screen centred loader — used for auth/route transitions (was `return null`,
// which rendered a blank page after a session expired mid-navigation).
export function PageLoading({ label = 'loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      <p className="text-xs lowercase tracking-wide text-faint">{label}</p>
    </div>
  );
}

// One placeholder row that echoes the archive/history card layout (thumb + lines).
function CardSkeleton() {
  return (
    <div className="flex gap-4 border border-line bg-surface p-5">
      <Bar className="h-16 w-16 shrink-0" />
      <div className="flex-1 space-y-3 py-1">
        <Bar className="h-4 w-1/2" />
        <Bar className="h-3 w-3/4" />
      </div>
    </div>
  );
}

// A list of card placeholders for the data pages while their queries load.
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
