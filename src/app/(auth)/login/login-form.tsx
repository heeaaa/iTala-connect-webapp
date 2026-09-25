'use client';

import { useActionState } from 'react';

import { signIn, type SignInState } from '@/server/actions/auth';

const initialState: SignInState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
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
          className="min-h-11 rounded-md border border-brand-border px-3"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={state.error ? 'signin-error' : undefined}
          className="min-h-11 rounded-md border border-brand-border px-3"
        />
      </div>

      <p id="signin-error" role="alert" aria-live="polite" className="min-h-5 text-sm text-brand-danger">
        {state.error ?? ''}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-brand-accent px-4 font-medium text-brand-accent-text disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
