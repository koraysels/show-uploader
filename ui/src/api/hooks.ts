import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useTRPC } from './trpc';

// Queries -------------------------------------------------------------------
//
// The `shows` domain is served over tRPC (end-to-end typed, no hand-written
// client methods). The rest still use the REST `api` client — tRPC lives
// alongside it and is being adopted domain by domain.

export function useShows() {
  const trpc = useTRPC();
  return useQuery(trpc.shows.listShows.queryOptions(undefined, { staleTime: 60_000 }));
}

export function useGenres() {
  const trpc = useTRPC();
  return useQuery(trpc.shows.listGenres.queryOptions(undefined, { staleTime: 300_000 }));
}

// Cover URLs per show from PocketBase (the master). Polls so a cover changed in
// the agenda admin shows up here within ~15s without a manual refresh.
export function useCovers() {
  const trpc = useTRPC();
  return useQuery(trpc.shows.listCovers.queryOptions(undefined, { refetchInterval: 15_000, staleTime: 10_000 }));
}

// The current PocketBase metadata for one show (what a platform sync would push).
export function useShow(id: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(trpc.shows.get.queryOptions({ id }, { enabled, staleTime: 10_000 }));
}

// Re-sync a published show's metadata/cover from PocketBase to selected platforms.
export function useSyncPlatforms() {
  const trpc = useTRPC();
  return useMutation(trpc.shows.syncPlatforms.mutationOptions());
}

export function useStagedShowIds() {
  return useQuery({ queryKey: ['staged-shows'], queryFn: api.getStagedShowIds, refetchInterval: 15_000 });
}

export function useStaged(showId: string | undefined) {
  return useQuery({
    queryKey: ['staged', showId],
    queryFn: () => api.getStaged(showId!),
    enabled: !!showId,
    refetchInterval: 10_000,
  });
}

export function useAuthCheck(enabled: boolean) {
  return useQuery({ queryKey: ['auth-me'], queryFn: api.checkAuth, enabled, retry: false });
}

export function useGeneratedMeta(title: string | undefined, description: string | undefined) {
  const trpc = useTRPC();
  return useQuery(
    trpc.shows.generateMeta.queryOptions(
      { title: title ?? '', description: description ?? '' },
      { enabled: !!title, retry: false, staleTime: Infinity }
    )
  );
}

export function usePendingVideos() {
  return useQuery({
    queryKey: ['pending-videos'],
    queryFn: api.listPendingVideos,
    refetchInterval: 15_000,
  });
}

export function useUploads() {
  return useQuery({
    queryKey: ['uploads'],
    queryFn: api.listUploads,
    refetchInterval: 10_000,
  });
}

// Mutations -----------------------------------------------------------------

export function useCreateUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createUpload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });
}

export function useRetryJob(uploadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (platform: string) => api.retryJob(uploadId, platform),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });
}

export function useUpdateMetadata(uploadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; description: string; tags: string[] }) =>
      api.updateMetadata(uploadId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });
}

export function usePublishRecord() {
  return useMutation({ mutationFn: (uploadId: string) => api.publishRecord(uploadId) });
}

export function useGenerateAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) => api.generateAudio(uploadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });
}

// Cover image lives in the PocketBase record; changing it invalidates shows so
// every view (form, archive) reflects the new master cover.
export function useUploadCover(showId: string | undefined) {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (file: File) => api.uploadCover(showId!, file),
    onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()),
  });
}

export function useClearCover(showId: string | undefined) {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: () => api.clearCover(showId!),
    onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()),
  });
}

// Managing an already-published platform link. update/set-public return { error }
// (a message on failure). remove un-links from the archive record → refetch shows.
export function usePlatformUpdate() {
  return useMutation({
    mutationFn: (body: {
      platform: string;
      url: string;
      title: string;
      description: string;
      tags: string[];
      imageUrl: string | null;
    }) => api.platformUpdate(body),
  });
}

// Real YouTube privacy status for a published video, so the UI can hide "set
// public" once it's actually public (enabled only for YouTube links).
export function useYoutubeStatus(url: string, enabled: boolean) {
  return useQuery({
    queryKey: ['yt-status', url],
    queryFn: () => api.platformYoutubeStatus(url),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePlatformSetPublic() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (url: string) => api.platformSetPublic(url),
    onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()),
  });
}

export function usePlatformRemove() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: ({ showId, label }: { showId: string; label: string }) => api.platformRemove(showId, label),
    onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()),
  });
}

export function useClaimPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.claimPendingVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-videos'] }),
  });
}
