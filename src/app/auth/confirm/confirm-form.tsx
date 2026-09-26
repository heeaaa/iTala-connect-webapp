'use client';

import { useActionState } from 'react';

import { platformStyles as s } from '@/components/platform/platform-frame';
import { confirmSetupLink, type LinkState } from '@/server/actions/account';

const initialState: LinkState = {};

export function ConfirmForm({ tokenHash, type }: { tokenHash: string; type: 'invite' | 'recovery' }) {
  const [state, formAction, pending] = useActionState(confirmSetupLink, initialState);
  return (
    <form
      action={formAction}
      className={s.formPanel}
      // The button stays focusable while it runs (a disabled one drops keyboard focus to the page,
      // so after a refusal the person would start again from the top); a second press is ignored.
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <p>
        {type === 'recovery'
          ? 'Press Continue, then choose a new password.'
          : 'A superadmin made this account for you. Press Continue, then choose your password.'}{' '}
        The link works once.
      </p>
      <p role="alert" className={s.formError}>
        {state.error ?? ''}
      </p>
      <button type="submit" aria-disabled={pending} className={`${s.button} ${s.buttonLive}`}>
        {pending ? 'Continuing…' : 'Continue'}
      </button>
    </form>
  );
}
