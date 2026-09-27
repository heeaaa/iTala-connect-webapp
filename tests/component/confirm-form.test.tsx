import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@/server/actions/account', () => ({ confirmSetupLink: fake.confirm }));
import { ConfirmForm } from '@/app/auth/confirm/confirm-form';

const TOKEN = 'ab12'.repeat(14);

beforeEach(() => vi.clearAllMocks());

describe('Set-up link page (A-09)', () => {
  it('sends the token once, keeps Continue focusable while it runs, and reads out a refusal', async () => {
    const user = userEvent.setup();
    let answer: (v: { error?: string }) => void = () => {};
    fake.confirm.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    render(<ConfirmForm tokenHash={TOKEN} type="invite" />);
    expect(
      screen.getByText(/A superadmin made this account for you\. Press Continue, then choose your password\./),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Continue' });
    await user.click(button);
    // A second press while the first runs must not spend the one-time token again.
    await user.click(await screen.findByRole('button', { name: 'Continuing…' }));
    expect(fake.confirm).toHaveBeenCalledTimes(1);
    const sent = fake.confirm.mock.calls[0]![1] as FormData;
    expect(sent.get('token_hash')).toBe(TOKEN);
    expect(sent.get('type')).toBe('invite');
    const busy = screen.getByRole('button', { name: 'Continuing…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();
    answer({ error: 'This link has expired or has already been used. Ask a superadmin for a new set-up link.' });
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired or has already been used.');
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    // React queues form actions, so a second press would only reach the server now.
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.confirm).toHaveBeenCalledTimes(1);
  });

  it('asks for a new password on a password link', () => {
    render(<ConfirmForm tokenHash={TOKEN} type="recovery" />);
    expect(screen.getByText(/Press Continue, then choose a new password\./)).toBeInTheDocument();
  });
});
