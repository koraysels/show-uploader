import { usePresence } from '../presence/PresenceProvider';

// Short, human label from a name/email (first token or local-part).
export function shortName(name: string): string {
  const base = name.includes('@') ? name.split('@')[0] : name;
  return base.split(/[.\s]+/)[0].toLowerCase();
}

export function PresenceRoster() {
  const { online, myUserId } = usePresence();
  if (online.length === 0) return null;

  const others = online.filter((u) => u.sub !== myUserId);
  const label =
    others.length === 0
      ? 'only you'
      : [...(myUserId ? ['you'] : []), ...others.map((u) => shortName(u.name))].join(', ');

  return (
    <div className="flex items-center gap-2 text-xs lowercase text-muted" title={`${online.length} online`}>
      <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
      <span className="max-w-[220px] truncate">{label}</span>
    </div>
  );
}
