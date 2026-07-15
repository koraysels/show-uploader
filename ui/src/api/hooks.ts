import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// Queries -------------------------------------------------------------------

export function useShows() {
  return useQuery({ queryKey: ['shows'], queryFn: api.listShows, staleTime: 60_000 });
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

export function useClaimPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.claimPendingVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-videos'] }),
  });
}
