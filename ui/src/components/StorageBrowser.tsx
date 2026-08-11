import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useBrowseStorage, useSignObjectOnDemand, useDeleteObject } from '../api/hooks';
import { humanSize } from '../format';
import { c } from '../theme';
import ConfirmAction from './ConfirmAction';

const CONSOLE_URL = import.meta.env.VITE_MINIO_CONSOLE_URL as string | undefined;

/**
 * Walk the bucket one level at a time.
 *
 * S3 has no directories — the "folders" here are the common prefixes the server
 * reports when listing with a delimiter, which is why navigation is a prefix
 * string rather than a tree.
 *
 * Delete is deliberately narrow: the server (isKeyReferenced) refuses to
 * delete anything the app still points at, so this can only ever remove a
 * true orphan — there is no way to delete a live show's video through here,
 * whatever prefix you're browsing.
 */
export default function StorageBrowser() {
  const [prefix, setPrefix] = useState('');
  const [signError, setSignError] = useState<string | null>(null);
  const listing = useBrowseStorage(prefix);
  const sign = useSignObjectOnDemand();
  const del = useDeleteObject();

  // The tab has to be opened inside the click's own task or the popup blocker
  // eats it; the URL is filled in once signing resolves.
  const open = (key: string) => {
    // Opened inside the click's own task or the popup blocker eats it.
    const tab = window.open('', '_blank');
    setSignError(null);
    sign(key)
      .then(({ url }) => {
        if (tab) tab.location.href = url;
        // A blocked popup leaves no tab and no error — say so rather than
        // looking like nothing happened.
        else setSignError('popup blocked — allow popups to open files');
      })
      .catch((err: Error) => {
        tab?.close();
        setSignError(err.message);
      });
  };

  // useDeleteObject's mutation state is shared across every row; tracking
  // which key is in flight is what keeps only that row's button showing it.
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = (key: string) => {
    setDeletingKey(key);
    setDeleteError(null);
    del.mutate(
      { key },
      {
        onError: (err) => setDeleteError(err.message),
        onSettled: () => setDeletingKey(null),
      }
    );
  };

  const segments = prefix.split('/').filter(Boolean);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
        <Crumb label="bucket" onClick={() => setPrefix('')} active={segments.length === 0} />
        {segments.map((seg, i) => (
          <Stack key={`${seg}-${i}`} direction="row" sx={{ alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: c.faint }}>
              /
            </Typography>
            <Crumb
              label={seg}
              onClick={() => setPrefix(`${segments.slice(0, i + 1).join('/')}/`)}
              active={i === segments.length - 1}
            />
          </Stack>
        ))}
      </Stack>

      {listing.isPending && (
        <Typography variant="caption" color="text.disabled">
          reading…
        </Typography>
      )}
      {listing.isError && (
        <Typography variant="caption" sx={{ color: c.danger }}>
          {listing.error.message}
        </Typography>
      )}

      {listing.data && (
        <Box sx={{ border: `1px solid ${c.line}` }}>
          {listing.data.folders.length === 0 && listing.data.files.length === 0 && (
            <Row>
              <Typography variant="caption" color="text.disabled">
                empty
              </Typography>
            </Row>
          )}

          {listing.data.folders.map((f) => (
            <Row key={f.key}>
              <Button
                variant="text"
                onClick={() => setPrefix(f.key)}
                sx={{ minHeight: 28, px: 0, fontFamily: 'monospace', fontSize: '0.75rem', color: c.link }}
              >
                {f.name}/
              </Button>
            </Row>
          ))}

          {listing.data.files.map((f) => (
            <Row key={f.key}>
              <Stack
                direction="row"
                sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
              >
                <Typography
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem', minWidth: 0, wordBreak: 'break-all' }}
                >
                  {f.name}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                  <Typography variant="caption" sx={{ color: c.faint }}>
                    {f.bytes === null ? '' : humanSize(f.bytes)}
                  </Typography>
                  <Button
                    variant="text"
                    onClick={() => open(f.key)}
                    sx={{ minHeight: 28, fontSize: '0.6875rem' }}
                  >
                    open
                  </Button>
                  <ConfirmAction
                    label="delete"
                    question="delete this file?"
                    onConfirm={() => remove(f.key)}
                    pending={del.isPending && deletingKey === f.key}
                    pendingLabel="deleting…"
                    title="refused if anything in the app still points at this file — only removes a true orphan"
                  />
                </Stack>
              </Stack>
            </Row>
          ))}
        </Box>
      )}

      {listing.data?.truncated && (
        <Typography variant="caption" sx={{ color: c.danger }}>
          long folder — only the first page is shown. use the console for the rest.
        </Typography>
      )}

      {signError && (
        <Typography variant="caption" sx={{ color: c.danger }}>
          {signError}
        </Typography>
      )}
      {deleteError && (
        <Typography variant="caption" sx={{ color: c.danger }}>
          {deleteError}
        </Typography>
      )}

      {CONSOLE_URL && (
        <Typography variant="caption" color="text.disabled">
          delete here only removes a file nothing in the app references —{' '}
          <Box
            component="a"
            href={CONSOLE_URL}
            target="_blank"
            rel="noreferrer"
            sx={{ color: c.link, textUnderlineOffset: '2px' }}
          >
            open the minio console
          </Box>{' '}
          to upload or share a link instead.
        </Typography>
      )}
    </Stack>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{ px: 1.5, py: 0.5, borderBottom: `1px solid ${c.line}`, '&:last-of-type': { borderBottom: 'none' } }}
    >
      {children}
    </Box>
  );
}

function Crumb({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <Button
      variant="text"
      onClick={onClick}
      sx={{
        minHeight: 28,
        px: 0.5,
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        color: active ? c.ink : c.link,
      }}
    >
      {label}
    </Button>
  );
}
