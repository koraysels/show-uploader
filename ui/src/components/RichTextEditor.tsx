import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { c, ROLE } from '../theme';

// Rich-text editor for the archive description — the notes field is HTML on the
// agenda (same as the react-admin editor there), so we edit it as rich text and
// emit HTML. Platform pushes strip the HTML to plain text server-side.
//
// TipTap (what react-admin's RichTextInput is built on) → matching output. The
// StarterKit gives bold/italic/headings/lists/quote/undo — a sensible subset.

// Only ever produce a link the browser will treat as navigation. A bare domain
// gets https://; anything that isn't http/https/mailto is refused outright, so
// a pasted `javascript:` URL can't be stored on the record.
function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null;
}

function ToolbarButton({
  editor,
  label,
  title,
  onClick,
  active,
}: {
  editor: Editor;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    // Tooltip, not `title` — `title` never fires on touch, so on a phone these
    // single-glyph buttons had no way to explain themselves.
    <Tooltip title={title}>
      <ToggleButton
        value={title}
        selected={!!active}
        size="small"
        aria-label={title}
        onMouseDown={(e) => e.preventDefault()} // keep the editor selection
        onClick={onClick}
        disabled={!editor.isEditable}
        sx={{
          // 32px keeps the toolbar usable with a thumb without making it bulky.
          minWidth: 32,
          height: 32,
          px: 1,
          border: 'none',
          fontSize: '0.75rem',
          lineHeight: 1,
          color: c.muted,
          '&:hover': { backgroundColor: c.line },
          '&.Mui-selected': { backgroundColor: c.ink, color: c.paper, '&:hover': { backgroundColor: c.inkHover } },
        }}
      >
        {label}
      </ToggleButton>
    </Tooltip>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const linkAnchor = useRef<HTMLButtonElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        // Clicking a link inside the editor should place the caret, not navigate
        // away mid-edit.
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      // TipTap emits "<p></p>" for an empty doc — normalise that to "" so an empty
      // description doesn't persist a stray empty paragraph.
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: { class: 'tiptap' },
    },
  });

  // Keep the editor in sync when the value is replaced from outside (show change,
  // applying the AI suggestion) — but not while the user is actively typing (that
  // would fight the caret). Compare against the current HTML to avoid a loop.
  useEffect(() => {
    // isDestroyed too: @tiptap/react tears the instance down on a 1ms timer after
    // unmount, so a lazy/Suspense remount can hand this effect a destroyed editor
    // whose schema is already nulled — getHTML() then dies on `schema.cached`.
    if (!editor || editor.isDestroyed) return;
    const current = editor.getHTML();
    const next = value || '';
    const currentNorm = current === '<p></p>' ? '' : current;
    if (next !== currentNorm && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const openLinkEditor = () => {
    // Pre-fill with the link the caret is sitting in, so the button edits an
    // existing link instead of silently making a second one.
    setLinkUrl((editor.getAttributes('link').href as string) ?? '');
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = safeUrl(linkUrl);
    if (!href) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    // With nothing selected there's no text to carry the link — insert the URL
    // as its own text so the operator isn't left with an invisible link.
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  return (
    <Box
      sx={{
        border: `1px solid ${c.line}`,
        backgroundColor: c.surface,
        '&:focus-within': { borderColor: c.ink },
        '& .tiptap': { minHeight: 96, px: 1.5, py: 1, lineHeight: 1.625, outline: 'none' },
        '& .tiptap a': { color: c.link, textDecoration: 'underline', textUnderlineOffset: '2px' },
      }}
    >
      <Stack
        direction="row"
        spacing={0.25}
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          borderBottom: `1px solid ${c.line}`,
          px: 0.75,
          py: 0.5,
        }}
      >
        <ToolbarButton editor={editor} label="B" title="bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton editor={editor} label="I" title="italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />
        <ToolbarButton editor={editor} label="H2" title="heading" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton editor={editor} label="•" title="bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton editor={editor} label="1." title="ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton editor={editor} label="❝" title="quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />
        <Tooltip title={editor.isActive('link') ? 'edit link' : 'add link'}>
          <ToggleButton
            ref={linkAnchor}
            value="link"
            selected={editor.isActive('link')}
            size="small"
            aria-label="add link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openLinkEditor}
            sx={{
              minWidth: 32,
              height: 32,
              px: 1,
              border: 'none',
              fontSize: '0.75rem',
              lineHeight: 1,
              color: c.muted,
              '&:hover': { backgroundColor: c.line },
              '&.Mui-selected': { backgroundColor: c.ink, color: c.paper, '&:hover': { backgroundColor: c.inkHover } },
            }}
          >
            🔗
          </ToggleButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />
        <ToolbarButton editor={editor} label="↶" title="undo" onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton editor={editor} label="↷" title="redo" onClick={() => editor.chain().focus().redo().run()} />
      </Stack>

      <Popover
        open={linkOpen}
        anchorEl={linkAnchor.current}
        onClose={() => setLinkOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { variant: 'outlined', sx: { mt: 0.5, p: 1.5, width: 320 } } }}
      >
        <Stack spacing={1}>
          <TextField
            autoFocus
            size="small"
            label="link address"
            placeholder="mixcloud.com/comingsoon"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button color={ROLE.write} disabled={!safeUrl(linkUrl)} onClick={applyLink} sx={{ minHeight: 36 }}>
              {editor.isActive('link') ? 'update' : 'add link'}
            </Button>
            {editor.isActive('link') && (
              <Button variant="text" color={ROLE.destroy} onClick={removeLink} sx={{ minHeight: 36, fontSize: '0.75rem' }}>
                remove
              </Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.disabled">
            https:// is added for you. on youtube and mixcloud the address is written out in full, since their
            descriptions are plain text.
          </Typography>
        </Stack>
      </Popover>

      <EditorContent editor={editor} placeholder={placeholder} />
    </Box>
  );
}
