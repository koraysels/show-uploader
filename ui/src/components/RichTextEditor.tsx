import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

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
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      disabled={!editor.isEditable}
      className={`min-w-7 rounded px-1.5 py-0.5 text-xs leading-none ${
        active ? 'bg-ink text-paper' : 'text-muted hover:bg-line'
      }`}
    >
      {label}
    </button>
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
      attributes: {
        class: 'tiptap min-h-[96px] px-3 py-2 leading-relaxed focus:outline-none',
      },
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

  const btn = 'flex flex-wrap items-center gap-0.5 border-b border-line bg-surface px-1.5 py-1';

  return (
    <div className="rounded border border-line bg-paper focus-within:border-ink">
      <div className={btn}>
        <ToolbarButton editor={editor} label="B" title="bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton editor={editor} label="I" title="italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <ToolbarButton editor={editor} label="H2" title="heading" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton editor={editor} label="• List" title="bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton editor={editor} label="1. List" title="ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton editor={editor} label="❝" title="quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <ToolbarButton editor={editor} label="↶" title="undo" onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton editor={editor} label="↷" title="redo" onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}
