import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';

type Props = {
  autoTrimSilence: boolean;
  trimStart: string;
  trimEnd: string;
  // The scheduled show length (HH:MM:SS) derived from the agenda start/end times —
  // the expected recording duration, offered as a suggested end point.
  scheduledDuration?: string | null;
  onAutoTrimChange: (v: boolean) => void;
  onChange: (field: 'trimStart' | 'trimEnd', value: string) => void;
};

function isValidTime(v: string) {
  return v === '' || /^(\d{1,2}:)?\d{2}:\d{2}$/.test(v);
}

export default function TrimFields({
  autoTrimSilence,
  trimStart,
  trimEnd,
  scheduledDuration,
  onAutoTrimChange,
  onChange,
}: Props) {
  const hasManual = !!trimStart || !!trimEnd;
  return (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={<Checkbox checked={autoTrimSilence} onChange={(e) => onAutoTrimChange(e.target.checked)} />}
        label={
          <Box>
            automatically trim silence at the start &amp; end{' '}
            <Typography component="span" variant="caption" color="text.disabled">
              — cuts dead air / intro for you
            </Typography>
          </Box>
        }
        sx={{ alignItems: 'flex-start', ml: 0, '& .MuiCheckbox-root': { pt: 0.25 } }}
      />

      <Accordion defaultExpanded={hasManual} disableGutters square sx={{ border: 'none', '&:before': { display: 'none' } }}>
        {/* Without a chevron this read as a dead caption — nothing said the
            manual fields were behind it. */}
        <AccordionSummary
          expandIcon={<Box sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>▼</Box>}
          sx={{
            px: 0,
            minHeight: 40,
            justifyContent: 'flex-start',
            gap: 1,
            '& .MuiAccordionSummary-content': { my: 0, flexGrow: 0 },
          }}
        >
          <Typography variant="caption" color="text.disabled">
            manual trim (optional) — set exact in/out points
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 1.5 }}>
          {/* Stacks on phones: two time fields plus an arrow never fit a narrow
              row without the inputs becoming unusably small. */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { sm: 'flex-end' } }}
          >
            <TextField
              fullWidth
              size="small"
              label="start · blank = beginning"
              placeholder="hh:mm:ss"
              value={trimStart}
              error={!isValidTime(trimStart)}
              onChange={(e) => onChange('trimStart', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Typography color="text.disabled" sx={{ pb: 1, display: { xs: 'none', sm: 'block' } }}>
              →
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="end · blank = end"
              placeholder="hh:mm:ss"
              value={trimEnd}
              error={!isValidTime(trimEnd)}
              onChange={(e) => onChange('trimEnd', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {scheduledDuration && (
            <Button
              variant="text"
              onClick={() => onChange('trimEnd', scheduledDuration)}
              sx={{ mt: 1, minHeight: 32, fontSize: '0.75rem', color: 'primary.main' }}
            >
              scheduled length ≈ {scheduledDuration} · use as end
            </Button>
          )}
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
            format hh:mm:ss (e.g. 00:04:30). overrides auto-trim. applied to youtube, mixcloud and the archive.
          </Typography>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
