'use client';

import { useActionState } from 'react';

import { platformStyles as s } from '@/components/platform/platform-frame';
import { signIn, type SignInState } from '@/server/actions/auth';

const initialState: SignInState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const invalid = state.error ? true : undefined;

  return (
    <form action={formAction} className={s.formPanel} noValidate>
      <input type="hidden" name="next" value={next} />

      <div className={s.field}>
        <label htmlFor="email" className={s.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email ?? ''}
          aria-describedby={state.error ? 'signin-error' : undefined}
          aria-invalid={invalid}
          className={s.input}
        />
      </div>

      <div className={s.field}>
        <label htmlFor="password" className={s.label}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={state.error ? 'signin-error' : undefined}
          aria-invalid={invalid}
          className={s.input}
        />
      </div>

      <p id="signin-error" role="alert" aria-live="polite" className={s.formError}>
        {state.error ?? ''}
      </p>

      <button type="submit" disabled={pending} className={`${s.button} ${s.buttonLive}`}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
