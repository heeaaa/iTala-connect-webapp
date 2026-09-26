import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/server/actions/platform', () => ({ saveDefaultRules: fake.save }));
import { DefaultRules } from '@/app/admin/settings/default-rules';

// jsdom has no layout: ProseMirror asks what is under a click and where the selection is.
beforeAll(() => {
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

const BUILT_IN = '<h2>Tournament Rules</h2><p>Official FIBA Rules apply.</p>';
const status = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite');

beforeEach(() => {
  vi.clearAllMocks();
  fake.save.mockResolvedValue({ ok: true, data: undefined });
});

describe('Default rules (S-02)', () => {
  it('starts from the built-in rules when none are stored, and says so', async () => {
    render(<DefaultRules stored="" builtIn={BUILT_IN} />);
    const text = await screen.findByRole('textbox', { name: 'Default rules' });
    expect(text).toHaveTextContent('Official FIBA Rules apply.');
    expect(
      screen.getByText(/Save an empty box to go back to the built-in iTala rules\. These are the built-in rules\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('starts from the stored template when there is one', async () => {
    render(<DefaultRules stored="<p>Our league rules</p>" builtIn={BUILT_IN} />);
    expect(await screen.findByRole('textbox', { name: 'Default rules' })).toHaveTextContent('Our league rules');
    expect(screen.queryByText(/These are the built-in rules/)).not.toBeInTheDocument();
  });

  it('an edit is unsaved until Save, which sends the rules and says new events will use them', async () => {
    const user = userEvent.setup();
    render(<DefaultRules stored="<p>Our league rules</p>" builtIn={BUILT_IN} />);
    const text = await screen.findByRole('textbox', { name: 'Default rules' });
    await user.click(text);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save default rules' }));
    expect(fake.save).toHaveBeenCalledWith('<p><strong>Our league rules</strong></p>');
    expect(await screen.findByText('Default rules saved. New events will start with them.')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    // Save kept focus while it ran (a disabled button would drop it).
    expect(screen.getByRole('button', { name: 'Save default rules' })).toHaveFocus();
  });

  it('keeps the edit unsaved when the save is refused or the server cannot be reached', async () => {
    const user = userEvent.setup();
    render(<DefaultRules stored="<p>Our league rules</p>" builtIn={BUILT_IN} />);
    await user.click(await screen.findByRole('textbox', { name: 'Default rules' }));
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Italic' }));
    fake.save.mockResolvedValueOnce({ ok: false, error: 'Only a superadmin can do this.' });
    await user.click(screen.getByRole('button', { name: 'Save default rules' }));
    expect(await screen.findByText('Only a superadmin can do this.')).toBeInTheDocument();
    expect(status()).toHaveAttribute('data-tone', 'error');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fake.save.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Save default rules' }));
    expect(
      await screen.findByText('Could not reach the server, so the rules were not saved. Check your connection.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('saving an empty box says new events go back to the built-in rules', async () => {
    const user = userEvent.setup();
    render(<DefaultRules stored="<p>Our league rules</p>" builtIn={BUILT_IN} />);
    await user.click(await screen.findByRole('textbox', { name: 'Default rules' }));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Save default rules' }));
    expect(fake.save).toHaveBeenCalledWith('<p></p>');
    expect(await screen.findByText('Saved. New events will start with the built-in iTala rules.')).toBeInTheDocument();
  });
});
