import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RulesEditor } from '@/app/admin/events/[eventId]/rules-editor';

// jsdom has no layout: ProseMirror asks which element is under a click, and where the selection is
// when focusing scrolls it into view. There is nothing to find here; the real editor is exercised in Chromium.
beforeAll(() => {
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

const renderEditor = (value = '<p>Hello</p>') => {
  const onChange = vi.fn();
  render(<RulesEditor value={value} label="Event rules" onChange={onChange} />);
  return onChange;
};

describe('Rules editor (E-70)', () => {
  it('offers exactly the old toolbar, labelled, with keyboard shortcuts', async () => {
    renderEditor();
    const toolbar = screen.getByRole('toolbar', { name: 'Rules formatting' });
    const names = ['Bold', 'Italic', 'Underline', 'Heading 2', 'Heading 3', 'Bullet list', 'Numbered list'];
    expect(Array.from(toolbar.querySelectorAll('button')).map((b) => b.textContent)).toEqual(names);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-keyshortcuts', 'Control+B Meta+B');
    const text = await screen.findByRole('textbox', { name: 'Event rules' });
    expect(text).toHaveAttribute('aria-multiline', 'true');
    expect(text).toHaveTextContent('Hello');
  });

  it('formats the selection, shows the pressed state and reports the HTML', async () => {
    const user = userEvent.setup();
    const onChange = renderEditor();
    const text = await screen.findByRole('textbox', { name: 'Event rules' });
    await user.click(text);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Hello</strong></p>');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Heading 2' }));
    expect(onChange).toHaveBeenLastCalledWith('<h2><strong>Hello</strong></h2>');
    await user.click(screen.getByRole('button', { name: 'Bullet list' }));
    expect(onChange.mock.lastCall![0]).toMatch(/^<ul><li>/);
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is one tab stop, with arrow keys, Home and End moving between the tools', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('textbox', { name: 'Event rules' });
    const tool = (name: string) => screen.getByRole('button', { name });
    expect(tool('Bold')).toHaveAttribute('tabindex', '0');
    expect(tool('Italic')).toHaveAttribute('tabindex', '-1');
    tool('Bold').focus();
    await user.keyboard('{ArrowRight}');
    expect(tool('Italic')).toHaveFocus();
    expect(tool('Italic')).toHaveAttribute('tabindex', '0');
    expect(tool('Bold')).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{End}');
    expect(tool('Numbered list')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(tool('Bold')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(tool('Numbered list')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tool('Bold')).toHaveFocus();
  });

  it('clicking a tool leaves the cursor in the text, so the next key types there', async () => {
    const user = userEvent.setup();
    renderEditor();
    const text = await screen.findByRole('textbox', { name: 'Event rules' });
    await user.click(text);
    await user.click(screen.getByRole('button', { name: 'Heading 2' }));
    // Straight away, not on the next frame: a key pressed now must not reach the toolbar.
    expect(text).toHaveFocus();
  });

  it('focuses the text when its label is clicked', async () => {
    const user = userEvent.setup();
    renderEditor();
    const text = await screen.findByRole('textbox', { name: 'Event rules' });
    await user.click(screen.getByText('Event rules'));
    // Tiptap focuses on the next animation frame.
    await waitFor(() => expect(text).toHaveFocus());
  });

  it('does not report a change just for loading the stored rules', async () => {
    const onChange = renderEditor('<h3>Timing</h3><ol><li><p>Two halves</p></li></ol>');
    await screen.findByRole('textbox', { name: 'Event rules' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
