import { lazy, Suspense, useRef } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useGenres, useUploadCover, useClearCover } from '../api/hooks';
import TagInput from './TagInput';
import { c, ROLE, LABEL_SX } from '../theme';

// The rich-text editor pulls in TipTap (~120 kB gzip) — load it only when a
// MetadataForm actually renders (the upload page), not on every page.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

type Props = {
  showId: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  generating: boolean;
  suggestedTags: string[];
  suggestedDescription: string;
  onChange: (field: string, value: string | string[]) => void;
};

// Section label — replaces the old `.label` utility class.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ ...LABEL_SX, mb: 0.75, display: 'block' }}>{children}</Typography>
  );
}

export default function MetadataForm({
  showId,
  title,
  description,
  tags,
  imageUrl,
  generating,
  suggestedTags,
  suggestedDescription,
  onChange,
}: Props) {
  const { data: genres = [] } = useGenres();
  const unusedSuggestions = suggestedTags.filter((t) => !tags.includes(t));
  // Offer the AI copy as a one-click suggestion (never auto-applied) — PB notes
  // stay the master until the operator chooses it.
  const canSuggestDescription = !!suggestedDescription && suggestedDescription.trim() !== description.trim();

  // Cover → PocketBase (the master), not S3. Upload writes the file into the
  // archive record's image field; the returned URL becomes the form's cover.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadCover = useUploadCover(showId);
  const clearCover = useClearCover(showId);
  const busy = uploadCover.isPending || clearCover.isPending;

  const pickCover = (file: File | undefined) => {
    if (!file) return;
    uploadCover.mutate(file, { onSuccess: ({ imageUrl: url }) => onChange('imageUrl', url ?? '') });
  };
  const removeCover = () => clearCover.mutate(undefined, { onSuccess: () => onChange('imageUrl', '') });

  return (
    <Stack spacing={2.5}>
      <Box>
        <FieldLabel>title</FieldLabel>
        <TextField fullWidth size="small" value={title} onChange={(e) => onChange('title', e.target.value)} />
      </Box>

      <Box>
        <FieldLabel>
          description
          {generating && (
            <Box component="span" sx={{ ml: 1, color: c.ink }}>
              · writing…
            </Box>
          )}
        </FieldLabel>
        {/* Rich text (HTML) — the agenda notes are rich text, so we edit them as
            such; platform pushes strip to plain text server-side. */}
        <Suspense fallback={<Skeleton variant="rectangular" height={132} />}>
          <RichTextEditor value={description} onChange={(html) => onChange('description', html)} />
        </Suspense>
        {(generating || canSuggestDescription) && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, flexShrink: 0 }}>
              {generating ? 'suggesting…' : 'ai suggestion:'}
            </Typography>
            {canSuggestDescription && (
              <Button
                onClick={() => onChange('description', suggestedDescription)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 36,
                  px: 1,
                  py: 0.5,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  fontSize: '0.75rem',
                  lineHeight: 1.625,
                  borderColor: c.line,
                  color: c.muted,
                }}
              >
                {suggestedDescription}
              </Button>
            )}
          </Stack>
        )}
      </Box>

      <Box>
        <FieldLabel>tags</FieldLabel>
        {/* Chip editor with autocomplete from the PocketBase genre list (the
            master tag vocabulary); new tags are allowed and become new genres. */}
        <TagInput tags={tags} suggestions={genres} onChange={(next) => onChange('tags', next)} />
        {(generating || unusedSuggestions.length > 0) && (
          <Stack direction="row" spacing={0.75} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75 }}>
            <Typography variant="caption" color="text.disabled">
              {generating ? 'suggesting…' : 'suggested (ai, pre-audio):'}
            </Typography>
            {unusedSuggestions.map((t) => (
              <Chip
                key={t}
                label={`+ ${t}`}
                clickable
                onClick={() => onChange('tags', [...tags, t])}
                sx={{ height: 28 }}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <FieldLabel>
          cover image{' '}
          <Box component="span" sx={{ color: c.faint }}>
            · optional
          </Box>
        </FieldLabel>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          {imageUrl && (
            <Box
              component="img"
              src={imageUrl}
              alt="cover"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                e.currentTarget.style.display = 'none';
              }}
              sx={{ width: 64, height: 64, flexShrink: 0, border: `1px solid ${c.line}`, objectFit: 'cover' }}
            />
          )}
          <Box
            component="input"
            ref={fileRef}
            type="file"
            accept="image/*"
            sx={{ display: 'none' }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              pickCover(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button disabled={busy} color={ROLE.write} onClick={() => fileRef.current?.click()} sx={{ minHeight: 40 }}>
            {uploadCover.isPending ? 'uploading…' : imageUrl ? 'replace cover' : 'upload cover'}
          </Button>
          {imageUrl && !busy && (
            <Tooltip title="clears the image on the pocketbase record">
              <Button
                variant="text"
                color={ROLE.destroy}
                onClick={removeCover}
                sx={{ minHeight: 32, fontSize: '0.6875rem' }}
              >
                remove
              </Button>
            </Tooltip>
          )}
        </Stack>
        {uploadCover.isError && (
          <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
            cover upload failed — try again.
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          saved to the agenda record in pocketbase (the master). default: empty — mixcloud then uses a square frame
          from ~20s into the video, and youtube keeps its own auto-chosen frame.
        </Typography>
      </Box>
    </Stack>
  );
}
