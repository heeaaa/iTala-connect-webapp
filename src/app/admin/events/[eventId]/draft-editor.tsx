'use client';
import { contrastRatio } from '@/lib/color';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DIVISION_COLOURS, type EditorInput, type EditorDivision, type EditorTeam } from '@/lib/event-editor';
import { saveDraft } from '@/server/actions/events';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { PlayersDialog } from '../../_components/players-dialog';
import { DatePicker } from '../../_components/date-picker';
import w from '../../admin-workspace.module.css';

export function DraftEditor({
  initial,
  links,
  readOnly,
  notice,
}: {
  initial: EditorInput;
  links: Record<string, { league_name: string; season: string | null }>;
  readOnly: boolean;
  notice: string;
}) {
  const [data, setData] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [message, setMessage] = useState(notice);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const [players, setPlayers] = useState<{ divisionId: string; team: EditorTeam } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => void } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const dirty = JSON.stringify(data) !== saved;
  useEffect(() => {
    const sections = Array.from(form.current?.querySelectorAll('details') ?? []);
    const key = `event-sections:${initial.id}`;
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (Array.isArray(stored))
        sections.forEach((section, i) => {
          section.open = stored[i] !== false;
        });
    } catch {
      /* Storage may be unavailable. */
    }
    const remember = () => {
      try {
        sessionStorage.setItem(key, JSON.stringify(sections.map((section) => section.open)));
      } catch {
        /* Collapse controls still work without persistence. */
      }
    };
    sections.forEach((section) => section.addEventListener('toggle', remember));
    return () => sections.forEach((section) => section.removeEventListener('toggle', remember));
  }, [initial.id]);
  useEffect(() => {
    if (!dirty) return;
    const currentURL = window.location.href;
    const currentState = window.history.state;
    const navigation = (window as Window & {
      navigation?: EventTarget & { traverseTo: (key: string) => unknown };
    }).navigation;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Modern browsers expose traversal before popstate and before Next routes.
    const navigate = (event: Event) => {
      const e = event as Event & { navigationType: string; destination: { key: string; sameDocument: boolean } };
      if (e.navigationType !== 'traverse' || !e.cancelable || !e.destination.sameDocument) return;
      e.preventDefault();
      setConfirm({
        title: 'Discard unsaved changes?',
        message: 'Your latest edits have not been saved.',
        run: () => {
          navigation?.removeEventListener('navigate', navigate);
          window.removeEventListener('beforeunload', unload);
          setSaved(JSON.stringify(data));
          navigation?.traverseTo(e.destination.key);
        },
      });
    };
    // Restore this entry before Next changes the rendered route, then let the
    // same accessible confirmation handle both cancelling and continuing Back.
    const back = (e: PopStateEvent) => {
      e.stopImmediatePropagation();
      window.history.pushState(currentState, '', currentURL);
      // Next may already have queued its traverse update on this target event.
      // Its public History API integration restores the matching route as well.
      window.history.replaceState(null, '', currentURL);
      setConfirm({
        title: 'Discard unsaved changes?',
        message: 'Your latest edits have not been saved.',
        run: () => {
          window.removeEventListener('popstate', back, true);
          window.removeEventListener('beforeunload', unload);
          setSaved(JSON.stringify(data));
          window.history.back();
        },
      });
    };
    const submit = (e: SubmitEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLFormElement) || target === form.current) return;
      e.preventDefault();
      e.stopPropagation();
      const submitter = e.submitter;
      setConfirm({
        title: 'Discard unsaved changes?',
        message: 'Your latest edits have not been saved.',
        run: () => {
          document.removeEventListener('submit', submit, true);
          window.removeEventListener('beforeunload', unload);
          setSaved(JSON.stringify(data));
          target.requestSubmit(submitter);
        },
      });
    };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element).closest('a');
      if (!link || e.ctrlKey || e.metaKey || e.shiftKey || link.target === '_blank') return;
      e.preventDefault();
      setConfirm({
        title: 'Discard unsaved changes?',
        message: 'Your latest edits have not been saved.',
        run: () => {
          setSaved(JSON.stringify(data));
          router.push(link.href);
        },
      });
    };
    window.addEventListener('beforeunload', unload);
    if (navigation) navigation.addEventListener('navigate', navigate);
    else window.addEventListener('popstate', back, true);
    document.addEventListener('click', click, true);
    document.addEventListener('submit', submit, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('popstate', back, true);
      navigation?.removeEventListener('navigate', navigate);
      document.removeEventListener('click', click, true);
      document.removeEventListener('submit', submit, true);
    };
  }, [dirty, data, router]);
  const change = <K extends keyof EditorInput>(key: K, value: EditorInput[K]) => {
    setData((v) => ({ ...v, [key]: value }));
    setMessage('');
  };
  const division = (id: string, patch: Partial<EditorDivision>) =>
    change(
      'divisions',
      data.divisions.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  const team = (divisionId: string, id: string, patch: Partial<EditorTeam>) => {
    const d = data.divisions.find((v) => v.id === divisionId)!;
    division(d.id, { teams: d.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  };
  const field = (key: 'name' | 'time_start' | 'time_end' | 'timezone', label: string, type = 'text') => (
    <label className={w.field}>
      <span className={s.label}>{label}</span>
      <input
        className={s.input}
        type={type}
        value={data[key]}
        required
        maxLength={key === 'name' ? 200 : 120}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  return (
    <>
      <TitlePlate title={initial.name || 'Event editor'} sub={readOnly ? 'Published event' : 'Draft event'} />
      {message && (
        <p role="status" className={w.notice}>
          {message}
        </p>
      )}
      {readOnly && (
        <p className={w.notice}>
          This event is published. <Link href={`/events/${data.id}`}>Open its schedule and enter scores.</Link>
        </p>
      )}
      <form
        ref={form}
        className={w.form}
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          start(async () => {
            const result = await saveDraft(data);
            if (!result.ok) setError(result.error);
            else {
              const next = { ...data, version: result.data };
              setData(next);
              setSaved(JSON.stringify(next));
              setMessage('Saved');
            }
          });
        }}
      >
        <div className={w.actions}>
          {!readOnly && (
            <button disabled={pending} className={`${s.button} ${s.buttonLive}`}>
              {pending ? 'Saving…' : 'Save draft'}
            </button>
          )}
          <Link href="/admin">{readOnly ? 'Back to events' : 'Cancel'}</Link>
          <button
            type="button"
            onClick={() => form.current?.querySelectorAll('details').forEach((d) => (d.open = true))}
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => form.current?.querySelectorAll('details').forEach((d) => (d.open = false))}
          >
            Collapse all
          </button>
          {dirty && <span>Unsaved changes</span>}
        </div>
        <p role="alert" className={s.formError}>
          {error}
        </p>
        <fieldset disabled={readOnly || pending} className={w.stack}>
          <details open className={w.section}>
            <summary>Event details</summary>
            <div className={w.stack}>
              {field('name', 'Event name')}
              <DatePicker
                value={data.schedule_days}
                onChange={(v) => change('schedule_days', v)}
                disabled={readOnly || pending}
              />
              <div className={w.fields}>
                {field('time_start', 'Daily start time', 'time')}
                {field('time_end', 'Daily end time', 'time')}
                {field('timezone', 'Time zone')}
                <label className={w.field}>
                  <span className={s.label}>Courts</span>
                  <input
                    className={s.input}
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={data.courts}
                    onChange={(e) => {
                      const courts = Math.max(1, Math.min(10, Number(e.target.value)));
                      setData((v) => ({
                        ...v,
                        courts,
                        court_names: Array.from({ length: courts }, (_, i) => v.court_names[i] ?? `Court ${i + 1}`),
                      }));
                    }}
                  />
                </label>
              </div>
              <p className={w.note}>
                Use an IANA time zone, such as Pacific/Auckland or America/Vancouver. All game times use this zone.
              </p>
              <div className={w.fields}>
                {data.court_names.map((name, i) => (
                  <label key={i} className={w.field}>
                    <span className={s.label}>Court {i + 1} name</span>
                    <input
                      required
                      maxLength={120}
                      className={s.input}
                      value={name}
                      onChange={(e) =>
                        change(
                          'court_names',
                          data.court_names.map((n, j) => (i === j ? e.target.value : n)),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <h3>Event page colours</h3>
              <div className={w.fields}>
                {(['theme_primary', 'theme_bg', 'theme_text', 'theme_text_secondary', 'theme_heading'] as const).map(
                  (key, i) => (
                    <label key={key} className={w.field}>
                      <span className={s.label}>{['Accent', 'Background', 'Text', 'Muted text', 'Headings'][i]}</span>
                      <input
                        type="color"
                        className={s.input}
                        value={data[key]}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </label>
                  ),
                )}
              </div>
              <div className={w.swatch} style={{ background: data.theme_bg, color: data.theme_text }}>
                <h3 style={{ color: data.theme_heading }}>{data.name || 'Your event'}</h3>
                <p>Teams, fixtures and standings</p>
                <p style={{ color: data.theme_text_secondary }}>Event page preview</p>
                <span style={{ color: data.theme_primary }}>Schedule · Standings · Teams</span>
              </div>
              {(['theme_text', 'theme_text_secondary', 'theme_heading', 'theme_primary'] as const).some(
                (key) => contrastRatio(data[key], data.theme_bg) < (key === 'theme_heading' ? 3 : 4.5),
              ) && (
                <p className={w.notice}>
                  Some colours may be hard to read against this background. Choose stronger contrast for text, headings
                  and links.
                </p>
              )}
            </div>
          </details>
          <details open className={w.section}>
            <summary>Divisions ({data.divisions.length})</summary>
            {!data.divisions.length && <p className={w.note}>Add a division, then its teams and players.</p>}
            {data.divisions.map((d, di) => (
              <section key={d.id} aria-label={`Division ${di + 1}`} className={w.section}>
                <h2>{d.name || `Division ${di + 1}`}</h2>
                {links[d.id] && (
                  <p className={w.notice}>
                    Linked to iTala mobile: {links[d.id]!.league_name}
                    {links[d.id]!.season ? ` (${links[d.id]!.season})` : ''}
                  </p>
                )}
                <div className={w.fields}>
                  <label className={w.field}>
                    <span className={s.label}>Division {di + 1} name</span>
                    <input
                      className={s.input}
                      required
                      maxLength={120}
                      value={d.name}
                      onChange={(e) => division(d.id, { name: e.target.value })}
                    />
                  </label>
                  <label className={w.field}>
                    <span className={s.label}>Division {di + 1} colour</span>
                    <input
                      className={s.input}
                      type="color"
                      value={d.color}
                      onChange={(e) => division(d.id, { color: e.target.value })}
                    />
                  </label>
                  <label className={w.field}>
                    <span className={s.label}>Brackets</span>
                    <select
                      className={s.input}
                      value={d.bracket_count}
                      onChange={(e) => division(d.id, { bracket_count: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={w.check}>
                  <input
                    type="checkbox"
                    checked={d.custom_games_per_team}
                    onChange={(e) => division(d.id, { custom_games_per_team: e.target.checked })}
                  />
                  Custom games/team
                </label>
                {d.custom_games_per_team && (
                  <label className={w.field}>
                    <span className={s.label}>Games per team</span>
                    <input
                      type="number"
                      className={s.input}
                      min={0}
                      max={20}
                      step={1}
                      value={d.games_per_team}
                      required
                      onChange={(e) => division(d.id, { games_per_team: Number(e.target.value) })}
                    />
                  </label>
                )}
                {d.teams.map((t, ti) => (
                  <div className={w.team} key={t.id}>
                    <div className={w.fields}>
                      <label className={w.field}>
                        <span className={s.label}>Team {ti + 1} name</span>
                        <input
                          className={s.input}
                          maxLength={120}
                          required
                          value={t.name}
                          onChange={(e) => team(d.id, t.id, { name: e.target.value })}
                        />
                      </label>
                      <label className={w.field}>
                        <span className={s.label}>Coach {ti + 1}</span>
                        <input
                          className={s.input}
                          maxLength={120}
                          value={t.coach}
                          onChange={(e) => team(d.id, t.id, { coach: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className={w.actions}>
                      <button
                        type="button"
                        className={`${s.button} ${s.buttonQuiet}`}
                        onClick={() => setPlayers({ divisionId: d.id, team: t })}
                      >
                        Players ({t.players.length})<span className="sr-only"> · {t.name}</span>
                      </button>
                      <button
                        type="button"
                        className={w.danger}
                        onClick={() =>
                          setConfirm({
                            title: `Remove ${t.name || 'team'}?`,
                            message: 'The team and its players will be removed when you save.',
                            run: () => division(d.id, { teams: d.teams.filter((v) => v.id !== t.id) }),
                          })
                        }
                      >
                        Remove team<span className="sr-only"> {t.name}</span>
                      </button>
                    </div>
                  </div>
                ))}
                <div className={w.actions}>
                  <button
                    type="button"
                    className={`${s.button} ${s.buttonQuiet}`}
                    onClick={() =>
                      division(d.id, {
                        teams: [...d.teams, { id: crypto.randomUUID(), name: '', coach: '', players: [] }],
                      })
                    }
                  >
                    + Add team
                  </button>
                  <button
                    type="button"
                    className={w.danger}
                    onClick={() =>
                      setConfirm({
                        title: `Remove ${d.name || 'division'}?`,
                        message: `Its ${d.teams.length} teams and their players will be removed when you save.`,
                        run: () =>
                          change(
                            'divisions',
                            data.divisions.filter((v) => v.id !== d.id),
                          ),
                      })
                    }
                  >
                    Remove division
                  </button>
                </div>
              </section>
            ))}
            <button
              type="button"
              className={`${s.button} ${s.buttonQuiet}`}
              onClick={() =>
                change('divisions', [
                  ...data.divisions,
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    color: DIVISION_COLOURS[data.divisions.length % 6]!,
                    bracket_count: 1,
                    custom_games_per_team: false,
                    games_per_team: 0,
                    teams: [],
                  },
                ])
              }
            >
              + Add division
            </button>
          </details>
        </fieldset>
      </form>
      {players && (
        <PlayersDialog
          team={players.team}
          onCancel={() => setPlayers(null)}
          onDone={(p) => {
            team(players.divisionId, players.team.id, { players: p });
            setPlayers(null);
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Continue"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
