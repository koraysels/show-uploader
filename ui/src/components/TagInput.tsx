import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';

type Props = {
  tags: string[];
  // Full vocabulary to autocomplete against (PocketBase genres).
  suggestions: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
};

/**
 * Chip editor with autocomplete over the genre vocabulary. Unknown tags are
 * allowed (freeSolo) — they become new genres server-side.
 *
 * MUI's Autocomplete replaces a hand-rolled popup that positioned itself with
 * absolute coordinates and closed on a blur timeout; that never behaved on
 * touch. This one handles keyboard, screen readers and mobile properly.
 */
export default function TagInput({ tags, suggestions, onChange, placeholder }: Props) {
  const dedupe = (next: string[]) => {
    const seen = new Set<string>();
    return next
      .map((t) => t.trim().replace(/,+$/, '').trim())
      .filter((t) => {
        const k = t.toLowerCase();
        if (!t || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      autoHighlight
      disableCloseOnSelect
      options={suggestions}
      value={tags}
      onChange={(_e, next) => onChange(dedupe(next as string[]))}
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (!q) return [];
        return opts
          .filter((o) => o.toLowerCase().includes(q) && !tags.some((t) => t.toLowerCase() === o.toLowerCase()))
          .slice(0, 8);
      }}
      renderValue={(value, getItemProps) =>
        (value as string[]).map((option, index) => (
          <Chip variant="outlined" label={option} {...getItemProps({ index })} key={option} />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder ?? (tags.length ? 'add another…' : 'type a tag, press enter')}
        />
      )}
    />
  );
}
