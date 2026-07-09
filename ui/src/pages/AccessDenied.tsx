export default function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 text-center">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto mb-4 h-3 w-3 rounded-full bg-accent" aria-hidden />
        <p className="font-display text-2xl font-semibold text-ink">Access pending</p>
        <p className="text-sm text-muted">
          Ask an admin to grant you the <span className="rounded bg-line px-1.5 py-0.5 font-mono text-[13px] text-ink">member</span>{' '}
          role in Zitadel, then reload.
        </p>
      </div>
    </div>
  );
}
