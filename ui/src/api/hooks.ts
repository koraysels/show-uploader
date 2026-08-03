import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useTRPC, trpcClient } from './trpc';

// Queries -------------------------------------------------------------------
//
// Everything except multipart uploads, the raw cover-byte upload and the SSE
// streams is served over tRPC (end-to-end typed). The remaining REST `api`
// methods cover exactly those cases.

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

// Save the upload-page edits (title/description/tags) straight to the PocketBase
// archive record, so they persist before the upload finishes. Invalidates shows
// so the (re-seeded) form + archive reflect the saved values.
export function useSaveShowMetadata() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation(
    trpc.shows.saveMetadata.mutationOptions({ onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()) })
  );
}

export function useStagedShowIds() {
  const trpc = useTRPC();
  return useQuery(trpc.uploads.getStagedShowIds.queryOptions(undefined, { refetchInterval: 15_000 }));
}

// In-progress multipart uploads (any browser) with a server-computed % per show,
// so this machine can show "uploading elsewhere · N%". Polls briskly since it
// reflects live activity.
export function useUploadingProgress() {
  const trpc = useTRPC();
  return useQuery(trpc.uploads.getUploadingProgress.queryOptions(undefined, { refetchInterval: 8_000 }));
}

export function useStaged(showId: string | undefined) {
  const trpc = useTRPC();
  return useQuery(
    trpc.uploads.getStaged.queryOptions({ showId: showId ?? '' }, { enabled: !!showId, refetchInterval: 10_000 })
  );
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
  const trpc = useTRPC();
  return useQuery(trpc.watcher.pending.queryOptions(undefined, { refetchInterval: 15_000 }));
}

export function useUploads() {
  const trpc = useTRPC();
  return useQuery(trpc.uploads.list.queryOptions(undefined, { refetchInterval: 10_000 }));
}

// Mutations -----------------------------------------------------------------

export function useCreateUpload() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation(
    trpc.uploads.create.mutationOptions({ onSuccess: () => qc.invalidateQueries(trpc.uploads.pathFilter()) })
  );
}

// Keeps the `retry.mutate(platform)` call-site shape; the uploadId is bound here.
export function useRetryJob(uploadId: string) {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (platform: 'youtube' | 'mixcloud' | 'archive') =>
      trpcClient.uploads.retryJob.mutate({ uploadId, platform }),
    onSuccess: () => qc.invalidateQueries(trpc.uploads.pathFilter()),
  });
}

export function usePublishRecord() {
  return useMutation({
    mutationFn: (uploadId: string) => trpcClient.uploads.publishRecord.mutate({ uploadId }),
  });
}

export function useGenerateAudio() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (uploadId: string) => trpcClient.uploads.generateAudio.mutate({ uploadId }),
    onSuccess: () => qc.invalidateQueries(trpc.uploads.pathFilter()),
  });
}

// Puts the agenda record back to draft — the inverse of usePublishRecord. The
// platform uploads and their links are untouched.
export function useUnpublishRecord() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (uploadId: string) => trpcClient.uploads.unpublishRecord.mutate({ uploadId }),
    onSuccess: () => qc.invalidateQueries(trpc.uploads.pathFilter()),
  });
}

// Removes the upload and its jobs from the queue. Files on S3 and the
// PocketBase record stay put.
export function useDeleteUpload() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (uploadId: string) => trpcClient.uploads.deleteUpload.mutate({ uploadId }),
    onSuccess: () => qc.invalidateQueries(trpc.uploads.pathFilter()),
  });
}

// One-shot backfill: re-runs the archive job on every upload still stored in
// its original container, converting them to browser-playable MP4.
export function useRemuxBackfill() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: () => trpcClient.uploads.remuxBackfill.mutate(),
    onSuccess: () => qc.invalidateQueries(trpc.uploads.pathFilter()),
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

// Managing an already-published platform link, over tRPC. update/set-public
// return { error } (a message on failure). remove un-links from the archive
// record → refetch shows.
export function usePlatformUpdate() {
  const trpc = useTRPC();
  return useMutation(trpc.platform.update.mutationOptions());
}

// Real YouTube privacy status for a published video, so the UI can hide "set
// public" once it's actually public (enabled only for YouTube links).
export function useYoutubeStatus(url: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(trpc.platform.youtubeStatus.queryOptions({ url }, { enabled, staleTime: 30_000, retry: false }));
}

export function usePlatformSetPublic() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation(
    trpc.platform.setPublic.mutationOptions({ onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()) })
  );
}

export function usePlatformRemove() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation(
    trpc.platform.removeLink.mutationOptions({ onSuccess: () => qc.invalidateQueries(trpc.shows.pathFilter()) })
  );
}

export function useClaimPending() {
  const qc = useQueryClient();
  const trpc = useTRPC();
  return useMutation({
    mutationFn: (id: string) => trpcClient.watcher.claimPending.mutate({ id }),
    onSuccess: () => qc.invalidateQueries(trpc.watcher.pathFilter()),
  });
}
