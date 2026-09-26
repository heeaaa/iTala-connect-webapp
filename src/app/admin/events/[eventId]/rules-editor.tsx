'use client';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../../admin-workspace.module.css';

type Chain = ReturnType<Editor['chain']>;

/** The old toolbar (PRD E-70), and nothing the stored-HTML allow-list would drop (E-71). */
const TOOLS: { label: string; shortcut?: string; active: (e: Editor) => boolean; run: (c: Chain) => Chain }[] = [
  { label: 'Bold', shortcut: 'Control+B Meta+B', active: (e) => e.isActive('bold'), run: (c) => c.toggleBold() },
  { label: 'Italic', shortcut: 'Control+I Meta+I', active: (e) => e.isActive('italic'), run: (c) => c.toggleItalic() },
  {
    label: 'Underline',
    shortcut: 'Control+U Meta+U',
    active: (e) => e.isActive('underline'),
    run: (c) => c.toggleUnderline(),
  },
  {
    label: 'Heading 2',
    active: (e) => e.isActive('heading', { level: 2 }),
    run: (c) => c.toggleHeading({ level: 2 }),
  },
  {
    label: 'Heading 3',
    active: (e) => e.isActive('heading', { level: 3 }),
    run: (c) => c.toggleHeading({ level: 3 }),
  },
  { label: 'Bullet list', active: (e) => e.isActive('bulletList'), run: (c) => c.toggleBulletList() },
  { label: 'Numbered list', active: (e) => e.isActive('orderedList'), run: (c) => c.toggleOrderedList() },
];

/**
 * The rules editor (E-70): Tiptap limited to the old toolbar's formats. It
 * reports HTML as the organiser types; the Server Action sanitises it before
 * it is stored and the event page sanitises it again (E-71). Tiptap's own
 * style injection is off, so nothing needs the CSP nonce.
 */
export function RulesEditor({
  value,
  label,
  onChange,
}: {
  value: string;
  /** The visible label for the text area; clicking it focuses the text. */
  label: string;
  onChange: (html: string) => void;
}) {
  const labelledBy = useId();
  // The toolbar is one tab stop; arrow keys, Home and End move between tools (WAI-ARIA toolbar).
  const [current, setCurrent] = useState(0);
  const tools = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent) => {
    const last = TOOLS.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : e.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setCurrent(next);
    tools.current[next]?.focus();
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
      }),
    ],
    content: value,
    // Rendered on the client only (no server HTML to match), and no injected <style>.
    immediatelyRender: false,
    injectCSS: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        class: w.rulesText ?? '',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => TOOLS.map((t) => (e ? t.active(e) : false)),
  });
  return (
    <div className={w.rules}>
      <span id={labelledBy} className={s.label} onClick={() => editor?.commands.focus()}>
        {label}
      </span>
      <div role="toolbar" aria-label="Rules formatting" className={w.rulesTools} onKeyDown={move}>
        {TOOLS.map((t, i) => (
          <button
            key={t.label}
            ref={(el) => {
              tools.current[i] = el;
            }}
            type="button"
            tabIndex={i === current ? 0 : -1}
            onFocus={() => setCurrent(i)}
            className={w.rulesTool}
            aria-pressed={active?.[i] ?? false}
            aria-keyshortcuts={t.shortcut}
            disabled={!editor}
            // A mouse click leaves the cursor in the text, so the next key types there
            // (the editor only takes focus back a frame later). Tab still reaches the tools.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor && t.run(editor.chain().focus()).run()}
          >
            {t.label}
          </button>
        ))}
      </div>
      {editor ? <EditorContent editor={editor} /> : <p className={w.note}>Loading the rules editor…</p>}
    </div>
  );
}
