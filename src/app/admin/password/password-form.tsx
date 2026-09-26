'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { platformStyles as s } from '@/components/platform/platform-frame';
import { changePassword, type PasswordState } from '@/server/actions/account';
import { PASSWORD_SAVED } from '@/server/actions/account-messages';

const initialState: PasswordState = {};

export function PasswordForm({ email, welcome }: { email: string; welcome: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  if (state.done) {
    return (
      <div className={s.formPanel}>
        <p role="status">{PASSWORD_SAVED}</p>
        <Link href="/admin" className={`${s.button} ${s.buttonLive}`}>
          Go to the dashboard
        </Link>
      </div>
    );
  }
  const invalid = state.error ? true : undefined;
  return (
    <form action={formAction} className={s.formPanel} noValidate>
      {welcome ? (
        <p>Choose a password to sign in with from now on. You can also sign in with Google if it is offered.</p>
      ) : null}
      {/* Lets password managers file the new password under this account. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className={s.field}>
        <label htmlFor="password" className={s.label}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-describedby="password-hint password-error"
          aria-invalid={invalid}
          className={s.input}
        />
        <p id="password-hint" className="text-brand-muted">
          At least 10 characters.
        </p>
      </div>
      <div className={s.field}>
        <label htmlFor="confirm" className={s.label}>
          Type it again
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-error"
          aria-invalid={invalid}
          className={s.input}
        />
      </div>
      <p id="password-error" role="alert" className={s.formError}>
        {state.error ?? ''}
      </p>
      <button type="submit" disabled={pending} className={`${s.button} ${s.buttonLive}`}>
        {pending ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
