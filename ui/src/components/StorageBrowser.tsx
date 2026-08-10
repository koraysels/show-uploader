import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useBrowseStorage, useSignObjectOnDemand } from '../api/hooks';
import { humanSize } from '../format';
import { c } from '../theme';

const CONSOLE_URL = import.meta.env.VITE_MINIO_CONSOLE_URL as string | undefined;

/**
 * Walk the bucket one level at a time.
 *
 * S3 has no directories — the "folders" here are the common prefixes the server
 * reports when listing with a delimiter, which is why navigation is a prefix
 * string rather than a tree.
 *
 * Deliberately read-only. This is for answering "what is actually in there";
 * anything destructive belongs in the MinIO console linked at the bottom, which
 * has real confirmation flows and an audit trail.
 */
export default function StorageBrowser() {
  const [prefix, setPrefix] = useState('');
  const [signError, setSignError] = useState<string | null>(null);
  const listing = useBrowseStorage(prefix);
  const sign = useSignObjectOnDemand();

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
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
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

      {CONSOLE_URL && (
        <Typography variant="caption" color="text.disabled">
          this view is read-only —{' '}
          <Box
            component="a"
            href={CONSOLE_URL}
            target="_blank"
            rel="noreferrer"
            sx={{ color: c.link, textUnderlineOffset: '2px' }}
          >
            open the minio console
          </Box>{' '}
          to upload, delete or share.
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
