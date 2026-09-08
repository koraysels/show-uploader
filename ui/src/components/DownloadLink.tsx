import { useState } from 'react';
import MuiLink from '@mui/material/Link';
import { useSignObjectOnDemand } from '../api/hooks';
import { ROLE } from '../theme';

const linkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  minHeight: 32,
  fontWeight: 500,
} as const;

/**
 * Signs its object only when clicked.
 *
 * Callers carry keys rather than presigned URLs — signing every artefact on
 * every poll was churn for objects that never change, and the mutating URL
 * tore down anything already using it.
 */
export default function DownloadLink({ objectKey, label }: { objectKey: string | null; label: string }) {
  const sign = useSignObjectOnDemand();
  const [failed, setFailed] = useState(false);

  if (!objectKey) return null;

  // The tab must be opened inside the click's own task or the popup blocker
  // eats it; the URL is filled in once signing resolves.
  const open = () => {
    const tab = window.open('', '_blank');
    setFailed(false);
    sign(objectKey)
      .then(({ url }) => {
        if (tab) tab.location.href = url;
        // A blocked popup leaves no tab and no error — say so rather than
        // looking like nothing happened.
        else setFailed(true);
      })
      .catch(() => {
        tab?.close();
        setFailed(true);
      });
  };

  return (
    <MuiLink component="button" onClick={open} color={ROLE.navigate} sx={linkSx}>
      {label} {failed ? '— failed' : '↓'}
    </MuiLink>
  );
}
