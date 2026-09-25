import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
vi.mock('@/server/actions/auth', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

const { LoginForm } = await import('@/app/(auth)/login/login-form');

describe('LoginForm', () => {
  it('has labelled email and password fields and carries the next path', () => {
    const { container } = render(<LoginForm next="/admin/events/1" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(container.querySelector('input[name="next"]')).toHaveValue('/admin/events/1');
  });

  it('shows the generic error from the action and keeps the email typed', async () => {
    signIn.mockResolvedValueOnce({ error: 'Incorrect email or password.', email: 'coach@example.nz' });
    const user = userEvent.setup();
    render(<LoginForm next="/admin" />);

    await user.type(screen.getByLabelText('Email'), 'coach@example.nz');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect email or password.')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Email')).toHaveValue('coach@example.nz');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'signin-error');

    const formData = signIn.mock.calls[0]?.[1] as FormData;
    expect(formData.get('email')).toBe('coach@example.nz');
    expect(formData.get('next')).toBe('/admin');
  });
});
