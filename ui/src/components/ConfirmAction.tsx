import { useState } from 'react';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

/**
 * A destructive action behind one inline confirmation step — no modal, no
 * browser dialog. First click swaps the button for "<question> yes / no", so
 * nothing irreversible happens on a stray click.
 *
 * The hint uses a real Tooltip rather than `title`, which never appears on
 * touch — on a phone that content was simply unreachable.
 */
export default function ConfirmAction({
  label,
  question,
  onConfirm,
  pending,
  pendingLabel = 'working…',
  title,
}: {
  label: string;
  question: string;
  onConfirm: () => void;
  pending?: boolean;
  pendingLabel?: string;
  title?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (pending)
    return (
      <Typography variant="caption" color="text.secondary">
        {pendingLabel}
      </Typography>
    );

  if (!confirming) {
    const button = (
      <Button
        variant="text"
        // Always red: this component only ever wraps something destructive, so
        // the colour is part of the warning rather than a per-call-site choice.
        color="error"
        onClick={() => setConfirming(true)}
        sx={{
          // Buttons centre their label; in a stretched column (the archive
          // header) that left the action floating mid-row. Pin it left and stop
          // it growing to the container's width.
          alignSelf: 'flex-start',
          justifyContent: 'flex-start',
          minHeight: 32,
          fontSize: '0.6875rem',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          textAlign: 'left',
        }}
      >
        {label}
      </Button>
    );
    return title ? <Tooltip title={title}>{button}</Tooltip> : button;
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography variant="caption" color="text.secondary">
        {question}
      </Typography>
      {/* "yes" is the only red thing here — "no" stays neutral so the safe
          choice never looks like the dangerous one. */}
      <Button
        variant="outlined"
        color="error"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
        sx={{ minHeight: 32, px: 1.25, fontSize: '0.6875rem' }}
      >
        yes
      </Button>
      <Button
        variant="text"
        onClick={() => setConfirming(false)}
        sx={{ minHeight: 32, fontSize: '0.6875rem', color: 'text.secondary' }}
      >
        no
      </Button>
    </Stack>
  );
}
