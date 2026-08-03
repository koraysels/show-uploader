import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import { c } from '../theme';

// Rich-text editor for the archive description — the notes field is HTML on the
// agenda (same as the react-admin editor there), so we edit it as rich text and
// emit HTML. Platform pushes strip the HTML to plain text server-side.
//
// TipTap (what react-admin's RichTextInput is built on) → matching output. The
// StarterKit gives bold/italic/headings/lists/quote/undo — a sensible subset.

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
  const editor = useEditor({
    extensions: [StarterKit],
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
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || '';
    const currentNorm = current === '<p></p>' ? '' : current;
    if (next !== currentNorm && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <Box
      sx={{
        border: `1px solid ${c.line}`,
        backgroundColor: c.surface,
        '&:focus-within': { borderColor: c.ink },
        '& .tiptap': { minHeight: 96, px: 1.5, py: 1, lineHeight: 1.625, outline: 'none' },
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
        <ToolbarButton editor={editor} label="↶" title="undo" onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton editor={editor} label="↷" title="redo" onClick={() => editor.chain().focus().redo().run()} />
      </Stack>
      <EditorContent editor={editor} placeholder={placeholder} />
    </Box>
  );
}
