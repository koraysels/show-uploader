import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, presenceStreamUrl, type ClaimView, type OnlineUser } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useUpload } from '../upload/UploadProvider';

type PresenceContextValue = {
  online: OnlineUser[];
  claims: Record<string, ClaimView>;
  myUserId: string | null;
  // Begin working a show (auto-claim). Idempotent per show.
  hold: (showId: string) => void;
  // Stop viewing a show. The claim is released immediately unless an upload for
  // it is still running (then it lives on until the upload ends or 30m sweep).
  unhold: (showId: string) => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function usePresence(): PresenceContextValue {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('usePresence must be used inside PresenceProvider');
  return ctx;
}

const HEARTBEAT_MS = 60_000;

// Nested inside UploadProvider so it can watch the in-flight upload: a claim is
// kept alive while its show's upload runs, even after the user navigates away.
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const upload = useUpload();
  // Any upload in progress keeps the last-held show's claim alive after navigation.
  const uploading = Object.values(upload.uploads).some((u) => u.status === 'uploading');
  const myUserId = (user?.profile.sub as string | undefined) ?? null;

  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [claims, setClaims] = useState<Record<string, ClaimView>>({});
  const [pageShowId, setPageShowId] = useState<string | null>(null);
  const lastHeldRef = useRef<string | null>(null);

  const indexClaims = (list: ClaimView[]) =>
    Object.fromEntries(list.map((c) => [c.showId, c]));

  // ---- SSE stream: roster + claims, with auto-reconnect ----
  useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const url = await presenceStreamUrl();
      if (!url || closed) return;
      es = new EventSource(url);
      es.addEventListener('snapshot', (e) => {
        const snap = JSON.parse((e as MessageEvent).data) as { online: OnlineUser[]; claims: ClaimView[] };
        setOnline(snap.online);
        setClaims(indexClaims(snap.claims));
      });
      es.addEventListener('roster', (e) => setOnline(JSON.parse((e as MessageEvent).data)));
      es.addEventListener('claims', (e) => setClaims(indexClaims(JSON.parse((e as MessageEvent).data))));
      es.onerror = () => {
        es?.close();
        if (closed) return;
        // Claims are durable server-side, so a dropped stream loses nothing —
        // reconnect and the snapshot re-syncs.
        retry = setTimeout(() => void connect(), 3000);
      };
    };
    void connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [user]);

  // ---- claim lifecycle ----
  const hold = useCallback((showId: string) => {
    lastHeldRef.current = showId;
    setPageShowId(showId);
    void api.claimShow(showId).catch(() => {});
  }, []);

  const unhold = useCallback((showId: string) => {
    setPageShowId((prev) => (prev === showId ? null : prev));
  }, []);

  // Heartbeat the active show (page open, or its upload still running).
  useEffect(() => {
    const active = pageShowId ?? (uploading ? lastHeldRef.current : null);
    if (!active) return;
    const iv = setInterval(() => void api.heartbeatShow(active).catch(() => {}), HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [pageShowId, uploading]);

  // Once a held show is neither open nor uploading, release it immediately so it
  // frees for the crew (rather than waiting for the 30m stale sweep).
  useEffect(() => {
    if (!pageShowId && !uploading && lastHeldRef.current) {
      const showId = lastHeldRef.current;
      lastHeldRef.current = null;
      void api.releaseShow(showId).catch(() => {});
    }
  }, [pageShowId, uploading]);

  return (
    <PresenceContext.Provider value={{ online, claims, myUserId, hold, unhold }}>
      {children}
    </PresenceContext.Provider>
  );
}
