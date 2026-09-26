'use client';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  additionMessage,
  defaultGamesPerTeam,
  defaultPlayoffTeams,
  maxCustomGames,
  playoffProblem,
  roundRobinProblem,
  roundRobinSummary,
} from '@/lib/schedule-additions';
import { addPlayoff, addRoundRobin, type Addition } from '@/server/actions/schedule-additions';
import { platformStyles as s } from '@/components/platform/platform-frame';
import { useModal } from '../../_components/use-modal';
import w from '../../admin-workspace.module.css';

export interface AdditionDivision {
  id: string;
  name: string;
  teams: number;
  custom: boolean;
  gamesPerTeam: number;
}

interface Common {
  eventId: string;
  division: AdditionDivision;
  /** Saves unsaved editor changes first, so the addition uses what is on screen (as Publish does). */
  saveFirst: () => Promise<boolean>;
  onClose: () => void;
}

const NOT_SAVED =
  'Your other changes could not be saved, so nothing was added. See the message at the top of the editor.';

/**
 * The shared frame: a native modal labelled by its title. It asks, then
 * shows the result in place with Done (the old editor's alert), so the
 * outcome is seen and announced wherever the organiser is on the page.
 */
function AdditionDialog({
  title,
  blocked,
  goLabel,
  pending,
  error,
  result,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  /** A reason the dialog can only be closed (too few teams, no dates). */
  blocked: string | null;
  goLabel: string;
  pending: boolean;
  error: string;
  result: string | null;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const resultId = useId();
  useModal(ref);
  useEffect(() => {
    if (result) done.current?.focus();
  }, [result]);
  // The go-ahead is disabled while it runs, which drops focus; a refusal gives it back.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (error && !pending && lost) go.current?.focus();
  }, [error, pending]);
  const close = (
    <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={onClose}>
      Close
    </button>
  );
  return (
    <dialog
      ref={ref}
      className={w.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {result ? (
        <>
          <p role="status" id={resultId}>
            {result}
          </p>
          <div className={w.actions}>
            {/* Focus lands here, so the result is also its description: read out even where the new status is not. */}
            <button
              ref={done}
              type="button"
              aria-describedby={resultId}
              className={`${s.button} ${s.buttonTeal}`}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </>
      ) : blocked ? (
        <>
          <p role="alert">{blocked}</p>
          <div className={w.actions}>{close}</div>
        </>
      ) : (
        <form
          data-keeps-page
          className={w.stack}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          <p role="alert" className={s.formError}>
            {error}
          </p>
          <div className={w.actions}>
            <button type="button" className={`${s.button} ${s.buttonQuiet}`} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button ref={go} className={`${s.button} ${s.buttonTeal}`} disabled={pending}>
              {pending ? 'Adding…' : goLabel}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** Runs an addition after saving unsaved edits, reporting problems in the dialog. */
function useAddition(saveFirst: () => Promise<boolean>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const run = (
    problem: string | null,
    action: () => Promise<{ ok: true; data: Addition } | { ok: false; error: string }>,
    report: (a: Addition) => string,
  ) => {
    setError(problem ?? '');
    if (problem) return;
    start(async () => {
      if (!(await saveFirst())) {
        setError(NOT_SAVED);
        return;
      }
      const outcome = await action();
      if (outcome.ok) setResult(report(outcome.data));
      else setError(outcome.error);
    });
  };
  return { pending, error, result, run };
}

/** "+ Round robin" (PRD E-63). */
export function RoundRobinDialog({
  eventId,
  division,
  days,
  saveFirst,
  onAdded,
  onClose,
}: Common & {
  days: number;
  /** The choice now stored on the division. */
  onAdded: (choice: { custom: boolean; gamesPerTeam: number }) => void;
}) {
  const [custom, setCustom] = useState(division.custom && division.gamesPerTeam > 0);
  const [games, setGames] = useState(String(defaultGamesPerTeam(division.teams, division)));
  const { pending, error, result, run } = useAddition(saveFirst);
  const max = maxCustomGames(division.teams);
  const blocked = roundRobinProblem({ teams: division.teams, days, custom: false, gamesPerTeam: 0 });
  const hint = useId();
  return (
    <AdditionDialog
      title={`Add round robin · ${division.name || 'Division'}`}
      blocked={blocked}
      goLabel="Add games"
      pending={pending}
      error={error}
      result={result}
      onClose={onClose}
      onSubmit={() => {
        const gamesPerTeam = custom ? Number(games) : 0;
        run(
          roundRobinProblem({ teams: division.teams, days, custom, gamesPerTeam }),
          () => addRoundRobin({ eventId, divisionId: division.id, custom, gamesPerTeam }),
          (a) => {
            onAdded({ custom, gamesPerTeam });
            return additionMessage('round-robin', a);
          },
        );
      }}
    >
      <p>{roundRobinSummary(division.teams)}</p>
      <label className={w.check}>
        <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
        Custom games/team
      </label>
      {custom && (
        <div>
          <label className={w.field}>
            <span className={s.label}>Games per team</span>
            <input
              className={s.input}
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              step={1}
              value={games}
              aria-describedby={hint}
              onChange={(e) => setGames(e.target.value)}
            />
          </label>
          <p id={hint} className={w.note}>
            Between 1 and {max}. Leave the box unticked for a full round robin.
          </p>
        </div>
      )}
    </AdditionDialog>
  );
}

/** "+ Playoff" (PRD E-64). */
export function PlayoffDialog({ eventId, division, saveFirst, onClose }: Common) {
  const [advancing, setAdvancing] = useState(String(defaultPlayoffTeams(division.teams)));
  const { pending, error, result, run } = useAddition(saveFirst);
  return (
    <AdditionDialog
      title={`Add playoff · ${division.name || 'Division'}`}
      blocked={division.teams < 2 ? playoffProblem(division.teams, 2) : null}
      goLabel="Add playoff"
      pending={pending}
      error={error}
      result={result}
      onClose={onClose}
      onSubmit={() =>
        run(
          playoffProblem(division.teams, Number(advancing)),
          () => addPlayoff({ eventId, divisionId: division.id, teams: Number(advancing) }),
          (a) => additionMessage('playoff', a),
        )
      }
    >
      <label className={w.field}>
        <span className={s.label}>How many teams advance to the playoff bracket? (max {division.teams})</span>
        <input
          className={s.input}
          type="number"
          inputMode="numeric"
          min={2}
          max={division.teams}
          step={1}
          value={advancing}
          onChange={(e) => setAdvancing(e.target.value)}
        />
      </label>
      <p className={w.note}>
        The top teams in the standings are seeded into a single-elimination bracket. Its games start an hour after the
        last game on the schedule, on the first court.
      </p>
    </AdditionDialog>
  );
}
