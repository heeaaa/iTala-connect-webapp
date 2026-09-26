'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import {
  createAdminAccount,
  newSetupLink,
  setAdminDisabled,
  setAdminRole,
  type SetupLink,
} from '@/server/actions/admins';
import { ConfirmDialog } from '../_components/confirm-dialog';
import w from '../admin-workspace.module.css';

export interface AdminAccount {
  id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'superadmin' | null;
  disabled_at: string | null;
  signed_in: boolean;
}

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
type Status = { tone: 'done' | 'error'; text: string } | null;

const ROLE_NAMES = { admin: 'Admin', superadmin: 'Superadmin' } as const;
const COLUMNS = ['Name', 'Email', 'Role', 'Status', 'Actions'];
const OFFLINE = 'Could not reach the server. Check your connection.';

/** Runs an action; a request that throws (offline) becomes an ordinary refusal. */
async function attempt<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

/** The one-time link, ready to copy. It takes focus when it appears so it is announced and at hand. */
function LinkPanel({ link, google, onDone }: { link: SetupLink; google: boolean; onDone: () => void }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState('');
  // A new link remounts the panel (its key), so this runs once per link.
  useEffect(() => heading.current?.focus(), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.link);
      setCopied('Link copied.');
    } catch {
      setCopied('Could not copy. Select the link and copy it.');
    }
  };
  return (
    <section aria-labelledby={id} className={`${s.formPanel} ${w.stack} ${w.linkPanel}`}>
      <h2 id={id} ref={heading} tabIndex={-1} className={w.panelTitle}>
        Set-up link for {link.name}
      </h2>
      <p>
        Send this link to {link.name} ({link.email}) yourself, by email or message. It works once and expires in 1 hour.
        {google ? ` They can also sign in with Google as ${link.email}.` : ''}
      </p>
      <label className={w.field}>
        <span className={s.label}>Set-up link</span>
        <input className={s.input} readOnly value={link.link} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className={w.actions}>
        <button type="button" className={`${s.button} ${s.buttonLive}`} onClick={copy}>
          Copy link
        </button>
        <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={onDone}>
          Done
        </button>
      </div>
      <p aria-live="polite" className={w.note}>
        {copied}
      </p>
    </section>
  );
}

/**
 * Admins screen (PRD A-09), superadmin only: create an account and hand over
 * its set-up link, make a fresh link, change a role, disable or enable. Your
 * own account can only change its password.
 */
export function AdminsView({
  accounts,
  error,
  selfId,
  google,
}: {
  accounts: AdminAccount[];
  error: boolean;
  selfId: string;
  google: boolean;
}) {
  const [link, setLink] = useState<SetupLink | null>(null);
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [disabling, setDisabling] = useState<AdminAccount | null>(null);
  // A role change asks first: arrow keys on a closed select change it at once on Windows,
  // and making someone a superadmin is as weighty as disabling them.
  const [promoting, setPromoting] = useState<{ account: AdminAccount; role: 'admin' | 'superadmin' } | null>(null);
  // Each row's role select, so a refused or cancelled change shows the stored role again.
  const roleSelects = useRef(new Map<string, HTMLSelectElement>());
  const showStoredRole = (account: AdminAccount) => {
    const select = roleSelects.current.get(account.id);
    if (select) select.value = account.role ?? '';
  };
  const formErrorId = useId();
  const [creating, create] = useTransition();
  const [busy, run] = useTransition();
  const nameField = useRef<HTMLInputElement>(null);
  // Where focus goes back to when the link panel closes.
  const opener = useRef<HTMLElement | null>(null);

  const showLink = (next: SetupLink) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLink(next);
  };
  const closeLink = () => {
    setLink(null);
    const back = opener.current?.isConnected ? opener.current : nameField.current;
    back?.focus();
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (creating) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    create(async () => {
      const result = await attempt(() =>
        createAdminAccount({
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          role: data.get('role') === 'superadmin' ? 'superadmin' : 'admin',
        }),
      );
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setFormError('');
      form.reset();
      opener.current = nameField.current;
      setLink(result.data);
    });
  };

  const freshLink = (account: AdminAccount) =>
    run(async () => {
      const result = await attempt(() => newSetupLink(account.id));
      if (result.ok) {
        setStatus(null);
        showLink(result.data);
      } else setStatus({ tone: 'error', text: result.error });
    });

  const askRole = (account: AdminAccount, value: string) => {
    // One change at a time; the stored role shows again if another is under way.
    if (busy || promoting) {
      showStoredRole(account);
      return;
    }
    setPromoting({ account, role: value === 'superadmin' ? 'superadmin' : 'admin' });
  };

  const changeRole = (account: AdminAccount, role: 'admin' | 'superadmin') => {
    run(async () => {
      const result = await attempt(() => setAdminRole({ userId: account.id, role }));
      if (result.ok)
        setStatus({
          tone: 'done',
          text: `${account.display_name} is now ${role === 'admin' ? 'an admin' : 'a superadmin'}.`,
        });
      else {
        showStoredRole(account);
        setStatus({ tone: 'error', text: result.error });
      }
    });
  };

  const changeDisabled = (account: AdminAccount, disabled: boolean) =>
    run(async () => {
      const result = await attempt(() => setAdminDisabled({ userId: account.id, disabled }));
      setStatus(
        result.ok
          ? { tone: 'done', text: `${account.display_name} is ${disabled ? 'disabled' : 'enabled'}.` }
          : { tone: 'error', text: result.error },
      );
    });

  return (
    <section aria-labelledby="admins-title">
      <TitlePlate id="admins-title" title="Admins" sub="Accounts and roles" />
      <section aria-labelledby="new-account" className={w.section}>
        <h2 id="new-account">New account</h2>
        <p className={w.note}>
          You get a one-time set-up link to send to the person yourself. No email is sent. They open it and choose a
          password.
        </p>
        <form onSubmit={submit} className={w.stack} noValidate>
          <div className={w.fields}>
            <label className={w.field}>
              <span className={s.label}>Name</span>
              <input
                ref={nameField}
                name="name"
                className={s.input}
                required
                maxLength={120}
                autoComplete="off"
                aria-describedby={formErrorId}
                aria-invalid={formError ? true : undefined}
              />
            </label>
            <label className={w.field}>
              <span className={s.label}>Email</span>
              <input
                name="email"
                type="email"
                className={s.input}
                required
                maxLength={254}
                autoComplete="off"
                aria-describedby={formErrorId}
                aria-invalid={formError ? true : undefined}
              />
            </label>
            <label className={w.field}>
              <span className={s.label}>Role</span>
              <select name="role" className={s.input} defaultValue="admin">
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </label>
          </div>
          <p id={formErrorId} role="alert" className={s.formError}>
            {formError}
          </p>
          <div className={w.actions}>
            <button type="submit" aria-disabled={creating} className={`${s.button} ${s.buttonLive}`}>
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </section>
      {link ? <LinkPanel key={link.link} link={link} google={google} onDone={closeLink} /> : null}
      <section aria-labelledby="accounts" className={w.section}>
        <h2 id="accounts">Accounts</h2>
        <p aria-live="polite" className={w.imageStatus} data-tone={status?.tone}>
          {status?.text}
        </p>
        {error ? (
          <p role="alert" className={s.error}>
            Could not load accounts. Please refresh the page.
          </p>
        ) : (
          <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Accounts">
            <table className={`${s.table} ${w.accounts}`} role="table">
              <thead role="rowgroup">
                <tr role="row">
                  {COLUMNS.map((c) => (
                    <th key={c} scope="col" role="columnheader">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {accounts.map((a) => {
                  const self = a.id === selfId;
                  return (
                    <tr key={a.id} role="row">
                      <td role="cell" data-label="Name">
                        {self ? `${a.display_name} (you)` : a.display_name}
                      </td>
                      <td role="cell" data-label="Email">
                        {a.email}
                      </td>
                      <td role="cell" data-label="Role">
                        {self ? (
                          (a.role && ROLE_NAMES[a.role]) || 'No access'
                        ) : (
                          <select
                            key={`${a.id}-${a.role}`}
                            aria-label={`Role for ${a.display_name}`}
                            className={s.input}
                            defaultValue={a.role ?? ''}
                            ref={(el) => {
                              if (el) roleSelects.current.set(a.id, el);
                              else roleSelects.current.delete(a.id);
                            }}
                            onChange={(e) => askRole(a, e.currentTarget.value)}
                          >
                            {a.role ? null : (
                              <option value="" disabled>
                                No access
                              </option>
                            )}
                            <option value="admin">Admin</option>
                            <option value="superadmin">Superadmin</option>
                          </select>
                        )}
                      </td>
                      <td role="cell" data-label="Status">
                        <div className={w.accountStatus}>
                          <span className={s.statusBug} data-status={a.disabled_at ? 'disabled' : 'published'}>
                            {a.disabled_at ? 'Disabled' : 'Active'}
                          </span>
                          {a.signed_in ? null : <span className={w.note}>Not signed in yet</span>}
                        </div>
                      </td>
                      <td role="cell" data-label="Actions">
                        {self ? (
                          <Link href="/admin/password" className={`${s.button} ${s.buttonQuiet}`}>
                            Change password
                          </Link>
                        ) : (
                          <div className={w.actions}>
                            {a.role && !a.disabled_at ? (
                              <button
                                type="button"
                                className={`${s.button} ${s.buttonQuiet}`}
                                aria-label={`New set-up link for ${a.display_name}`}
                                onClick={() => freshLink(a)}
                              >
                                New set-up link
                              </button>
                            ) : null}
                            {a.disabled_at ? (
                              <button
                                type="button"
                                className={`${s.button} ${s.buttonQuiet}`}
                                aria-label={`Enable ${a.display_name}`}
                                onClick={() => changeDisabled(a, false)}
                              >
                                Enable
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={w.danger}
                                aria-label={`Disable ${a.display_name}`}
                                onClick={() => setDisabling(a)}
                              >
                                Disable
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {promoting ? (
        <ConfirmDialog
          title={`Make ${promoting.account.display_name} ${promoting.role === 'superadmin' ? 'a superadmin' : 'an admin'}?`}
          message={
            promoting.role === 'superadmin'
              ? 'Superadmins can open and change every event, the platform settings and every account.'
              : 'Admins can only manage their own events. They lose the platform settings and the Admins screen.'
          }
          confirmLabel="Change role"
          onCancel={() => {
            showStoredRole(promoting.account);
            setPromoting(null);
          }}
          onConfirm={() => {
            changeRole(promoting.account, promoting.role);
            setPromoting(null);
          }}
        />
      ) : null}
      {disabling ? (
        <ConfirmDialog
          title={`Disable ${disabling.display_name}?`}
          message="They lose admin access straight away, on every device. Their events stay as they are. You can enable the account again later."
          confirmLabel="Disable account"
          onCancel={() => setDisabling(null)}
          onConfirm={() => {
            changeDisabled(disabling, true);
            setDisabling(null);
          }}
        />
      ) : null}
    </section>
  );
}
