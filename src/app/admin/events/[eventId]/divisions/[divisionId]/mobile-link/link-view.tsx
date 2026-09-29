'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import { DUPLICATE, duplicateMobileTeams, leagueLabel, startingPairs, unpairedHint } from '@/lib/mobile-link';
import { saveMobileLink } from '@/server/actions/mobile-link';
import { ConfirmDialog } from '../../../../../_components/confirm-dialog';
import w from '../../../../../admin-workspace.module.css';

export interface LinkPageData {
  eventId: string;
  eventName: string;
  eventStatus: string;
  divisionId: string;
  divisionName: string;
  currentLeagueId: string | null;
  currentLeagueName: string | null;
  teams: { id: string; name: string }[];
  /** Other divisions of this event that are linked, for the same-league note. */
  others: { name: string; leagueId: string }[];
  leagues: { id: string; name: string; season: string; is_archived: boolean; is_closed: boolean }[];
  leagueId: string;
  mobileTeams: { id: string; name: string }[];
  otherLinkCount: number;
  existing: Record<string, string>;
  unreachable: boolean;
}

/**
 * The link wizard (PRD M-03): pick the mobile league, then say which mobile
 * team each division team is. Results are matched by these pairs, never by
 * name; names only fill the form in.
 */
export function LinkView({ data }: { data: LinkPageData }) {
  const router = useRouter();
  const idBase = useId();
  const [pairs, setPairs] = useState(() => startingPairs(data.teams, data.mobileTeams, data.existing));
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, save] = useTransition();
  const clash = data.leagueId ? data.others.find((o) => o.leagueId === data.leagueId) : undefined;
  const unpaired = data.teams.filter((t) => !pairs[t.id]).length;
  const list = data.teams.map((t) => ({ teamId: t.id, mobileTeamId: pairs[t.id] ?? '' }));
  // After a refused save, the pairs still in the way are marked, and clear as they are fixed.
  const clashing = new Set(error === DUPLICATE ? duplicateMobileTeams(list) : []);

  const replacing = !!data.currentLeagueId && data.currentLeagueId !== data.leagueId;
  const proposedName = data.leagues.find((l) => l.id === data.leagueId)?.name ?? data.leagueId;
  const submit = (confirmed = false) => {
    if (saving) return;
    if (duplicateMobileTeams(list).length) {
      setError(DUPLICATE);
      return;
    }
    if (replacing && !confirmed) {
      setConfirming(true);
      return;
    }
    setError('');
    save(async () => {
      let result: { ok: true } | { ok: false; error: string };
      try {
        result = await saveMobileLink({
          eventId: data.eventId,
          divisionId: data.divisionId,
          leagueId: data.leagueId,
          expectedLeagueId: data.currentLeagueId,
          confirmReplace: confirmed,
          pairs: list,
        });
      } catch {
        result = { ok: false, error: 'Could not reach the server. Check your connection.' };
      }
      if (result.ok) router.push(`/admin/events/${data.eventId}/results?linked=1`);
      else setError(result.error);
    });
  };

  return (
    <section aria-labelledby={`${idBase}-title`}>
      <TitlePlate id={`${idBase}-title`} title={`Link “${data.divisionName}” to the mobile app`} sub={data.eventName} />
      <div className={w.actions}>
        <Link href={`/admin/events/${data.eventId}`} className={`${s.button} ${s.buttonQuiet}`}>
          Back to event
        </Link>
      </div>
      {data.unreachable ? (
        <div className={w.section}>
          <h2>Could not reach the mobile app</h2>
          <p className={w.note}>The mobile app did not answer. Refresh to try again in a moment.</p>
        </div>
      ) : (
        <>
          <p className={w.note}>
            Results are matched by these pairs, never by name. Names are only used to fill this form in.
          </p>
          <p className={w.note}>
            {data.eventStatus === 'published'
              ? 'The linked published schedule can appear in the mobile app on refresh. Only paired teams can start its games.'
              : 'Publish this event before its schedule appears in the mobile app. Only paired teams can start its games.'}
          </p>
          {/* A plain form: choosing a league loads its teams only when asked (no change on selection alone). */}
          <form method="get" className={w.fields}>
            <label className={w.field}>
              <span className={s.label}>Mobile app league</span>
              <select name="league" className={s.input} defaultValue={data.leagueId}>
                <option value="">Choose a league…</option>
                {data.leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {leagueLabel(l)}
                  </option>
                ))}
              </select>
            </label>
            <div className={w.field}>
              <span className={s.label} aria-hidden="true">
                &nbsp;
              </span>
              <button type="submit" className={`${s.button} ${s.buttonQuiet} justify-self-start`}>
                Show its teams
              </button>
            </div>
          </form>
          {data.leagueId ? (
            <section aria-labelledby={`${idBase}-pairs`} className={w.section}>
              <h2 id={`${idBase}-pairs`}>Teams</h2>
              {clash ? <p className={w.notice}>Note: “{clash.name}” is already linked to this same league.</p> : null}
              {data.otherLinkCount > 0 ? (
                <p className={w.notice}>
                  This league is also linked to {data.otherLinkCount} other event division
                  {data.otherLinkCount === 1 ? '' : 's'}.
                </p>
              ) : null}
              <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Team pairs">
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">Team in this division</th>
                      <th scope="col">Team in the mobile app</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teams.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>
                          <select
                            className={s.input}
                            aria-label={`Mobile team for ${t.name}`}
                            aria-invalid={clashing.has(pairs[t.id] ?? '') || undefined}
                            aria-describedby={clashing.has(pairs[t.id] ?? '') ? `${idBase}-error` : undefined}
                            value={pairs[t.id] ?? ''}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setPairs((p) => ({ ...p, [t.id]: value }));
                            }}
                          >
                            <option value="">Not in the mobile app</option>
                            {data.mobileTeams.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p aria-live="polite" className={w.note}>
                {unpairedHint(unpaired)}
              </p>
              <p id={`${idBase}-error`} role="alert" className={s.formError}>
                {error}
              </p>
              <div className={w.actions}>
                <button
                  type="button"
                  className={`${s.button} ${s.buttonLive}`}
                  aria-disabled={saving}
                  onClick={() => submit()}
                >
                  {saving ? 'Saving…' : 'Save link'}
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}
      {confirming ? (
        <ConfirmDialog
          title="Replace this division’s mobile league?"
          message={`“${data.divisionName}” is linked to “${data.currentLeagueName || data.currentLeagueId}”. Replace it with “${proposedName}”? Review the team pairs before saving.`}
          confirmLabel="Replace link"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            submit(true);
          }}
        />
      ) : null}
    </section>
  );
}
