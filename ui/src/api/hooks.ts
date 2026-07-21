import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// Queries -------------------------------------------------------------------

export function useShows() {
  return useQuery({ queryKey: ['shows'], queryFn: api.listShows, staleTime: 60_000 });
}

export function useGenres() {
  return useQuery({ queryKey: ['genres'], queryFn: api.listGenres, staleTime: 300_000 });
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
  return useQuery({
    queryKey: ['meta', title, description],
    queryFn: () => api.generateMeta(title ?? '', description ?? ''),
    enabled: !!title,
    retry: false,
    staleTime: Infinity,
  });
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
  return useMutation({
    mutationFn: (file: File) => api.uploadCover(showId!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function useClearCover(showId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearCover(showId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}

// Managing an already-published platform link. update/set-public return { error }
// (a message on failure). remove un-links from the archive record → refetch shows.
export function usePlatformUpdate() {
  return useMutation({
    mutationFn: (body: { platform: string; url: string; title: string; description: string; tags: string[] }) =>
      api.platformUpdate(body),
  });
}

export function usePlatformSetPublic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.platformSetPublic(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function usePlatformRemove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ showId, label }: { showId: string; label: string }) => api.platformRemove(showId, label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows'] }),
  });
}

export function useClaimPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.claimPendingVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-videos'] }),
  });
}
