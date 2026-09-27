'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import type { RosterPlayer } from '@/lib/mobile-rosters';
import type { RosterComparison, RosterTeam } from '@/server/mobile/rosters';
import w from '../../../../../admin-workspace.module.css';

const leagueLabel = (l: { name: string; season: string | null }) => `${l.name}${l.season ? ` (${l.season})` : ''}`;

function RosterList({ title, caption, players }: { title: string; caption: string; players: RosterPlayer[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {players.length ? (
        <table className={w.roster}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Number</th>
              <th scope="col">Player</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={`${p.number}-${p.name}-${i}`}>
                <td>{p.number || <span aria-label="No number">-</span>}</td>
                <td>{p.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={w.note}>No players.</p>
      )}
    </div>
  );
}

function TeamRosters({ team, linkHref }: { team: RosterTeam; linkHref: string }) {
  const idBase = useId();
  const players = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`;
  return (
    <section aria-labelledby={`${idBase}-team`} className={w.section}>
      <h2 id={`${idBase}-team`}>{team.name}</h2>
      {team.mobile ? (
        <p className={team.same ? w.note : w.notice} data-roster={team.same ? 'same' : 'differs'}>
          {team.note}
          {team.mobile.teamOnly ? '. The mobile app keeps no roster for this team (team only).' : ''}
        </p>
      ) : (
        <p className={w.notice} data-roster="unpaired">
          Not paired with a mobile team, so there is nothing to compare. <Link href={linkHref}>Pair it</Link> in the
          mobile link.
        </p>
      )}
      <div className={w.rosterPair}>
        <RosterList
          title={`iTala Connect · ${players(team.connect.length)}`}
          caption={`${team.name} in iTala Connect`}
          players={team.connect}
        />
        {team.mobile && team.mobileRoster ? (
          <RosterList
            title={`Mobile app: ${team.mobile.name} · ${players(team.mobileRoster.length)}`}
            caption={`${team.mobile.name} in the mobile app`}
            players={team.mobileRoster}
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * Compare rosters (PRD M-11): each team's players in iTala Connect and in
 * its paired mobile team, as two lists, with one note per team. Read only:
 * there is nothing here that changes either side.
 */
export function RostersView({ comparison: c }: { comparison: RosterComparison }) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const idBase = useId();
  const eventHref = `/admin/events/${c.event.id}`;
  const linkHref = `/admin/events/${c.event.id}/divisions/${c.division.id}/mobile-link`;
  const paired = c.state === 'ready' ? c.teams.filter((t) => t.mobile) : [];
  const differ = paired.filter((t) => !t.same).length;
  const unpaired = c.state === 'ready' ? c.teams.length - paired.length : 0;

  return (
    <section aria-labelledby={`${idBase}-title`}>
      <TitlePlate id={`${idBase}-title`} title={`Compare “${c.division.name}” rosters`} sub={c.event.name} />
      <div className={w.actions}>
        {c.state !== 'not_linked' ? (
          <button
            type="button"
            className={`${s.button} ${s.buttonQuiet}`}
            aria-disabled={refreshing}
            onClick={() => {
              if (!refreshing) refresh(() => router.refresh());
            }}
          >
            {refreshing ? 'Reading the mobile app…' : 'Refresh'}
          </button>
        ) : null}
        <Link href={eventHref} className={`${s.button} ${s.buttonQuiet}`}>
          Back to event
        </Link>
      </div>

      {c.state === 'not_linked' ? (
        <div className={w.section}>
          <h2>Not linked to the mobile app</h2>
          <p className={w.note}>
            Link this division to a mobile league first, then its rosters can be compared.{' '}
            <Link href={linkHref}>Link to mobile app</Link>
          </p>
        </div>
      ) : c.state === 'league_gone' ? (
        <div className={w.section}>
          <h2>That league is no longer in the mobile app</h2>
          <p className={w.note}>
            This division is linked to {leagueLabel(c.league)}, which the mobile app no longer has.{' '}
            <Link href={linkHref}>Choose another league</Link>
          </p>
        </div>
      ) : c.state === 'unreachable' ? (
        <div className={w.section}>
          <h2>Could not reach the mobile app</h2>
          <p className={w.note}>The mobile app did not answer. Refresh to try again in a moment.</p>
        </div>
      ) : (
        <>
          <p className={w.note}>
            Read only. Linked to {leagueLabel(c.league)}. Each list is sorted by jersey number, then name; nothing here
            changes either side.
          </p>
          <p role="status" className={differ ? w.notice : w.note}>
            {paired.length === 0
              ? 'No team in this division is paired with a mobile team yet.'
              : differ === 0
                ? paired.length === 1
                  ? 'The paired team is the same in both.'
                  : `All ${paired.length} paired teams are the same in both.`
                : paired.length === 1
                  ? 'The paired team differs.'
                  : `${differ} of ${paired.length} paired teams ${differ === 1 ? 'differs' : 'differ'}.`}
            {unpaired ? ` ${unpaired} not paired.` : ''}
          </p>
          {c.teams.map((t) => (
            <TeamRosters key={t.id} team={t} linkHref={linkHref} />
          ))}
          {c.unpairedMobile.length ? (
            <p className={w.note}>
              In the mobile league but not paired with a team here: {c.unpairedMobile.join(', ')}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
