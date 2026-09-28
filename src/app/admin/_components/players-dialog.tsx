'use client';
import { useState, useRef } from 'react';
import type { EditorTeam } from '@/lib/event-editor';
import { parsePlayersForTeam } from '@/lib/roster-parse';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';
import { useModal } from './use-modal';
export function PlayersDialog({
  team,
  onDone,
  onCancel,
}: {
  team: EditorTeam;
  onDone: (players: EditorTeam['players']) => void;
  onCancel: () => void;
}) {
  const [players, setPlayers] = useState(team.players);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [flags, setFlags] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDialogElement>(null);
  useModal(ref);
  return (
    <dialog
      ref={ref}
      className={w.dialog}
      aria-labelledby="players-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="players-title">Players · {team.name}</h2>
      <form
        data-keeps-page
        onSubmit={(e) => {
          e.preventDefault();
          onDone(players);
        }}
      >
        <div className={w.rosterPaste}>
          <label className={w.field}>
            <span className={s.label}>Paste players</span>
            <textarea
              data-autofocus={players.length === 0 || undefined}
              className={s.input}
              rows={5}
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setPasteError('');
              }}
              placeholder={'Ana Lim #7\n#11 Juan Dela Cruz\nMia Santos-24'}
            />
          </label>
          <p className={w.note}>
            One player per line. Names and jersey numbers are separated automatically. Review the rows before saving.
          </p>
          <button
            type="button"
            className={`${s.button} ${s.buttonQuiet}`}
            onClick={() => {
              const parsed = parsePlayersForTeam(paste, team.name);
              if (!parsed.length) {
                setPasteError('Paste at least one player.');
                return;
              }
              if (players.length + parsed.length > 200) {
                setPasteError('A team can have at most 200 players.');
                return;
              }
              if (parsed.some((p) => p.name.length > 120 || p.number.length > 10)) {
                setPasteError('A pasted name or number is too long. Edit the paste and try again.');
                return;
              }
              const added = parsed.map((p) => ({
                id: crypto.randomUUID(),
                name: p.name,
                number: p.number,
                flag: p.flag,
              }));
              setPlayers((current) => [...current, ...added.map(({ id, name, number }) => ({ id, name, number }))]);
              setFlags((current) =>
                Object.fromEntries([
                  ...Object.entries(current),
                  ...added.filter((p) => p.flag).map((p) => [p.id, p.flag!]),
                ]),
              );
              setPaste('');
              setPasteError('');
            }}
          >
            Add pasted players
          </button>
          {pasteError && (
            <p role="alert" className={w.formError}>
              {pasteError}
            </p>
          )}
        </div>
        {players.map((p, i) => (
          <div key={p.id}>
            <div className={w.playerRow}>
              <label className={w.field}>
                <span className={s.label}>Number {i + 1}</span>
                <input
                  className={s.input}
                  value={p.number}
                  maxLength={10}
                  onChange={(e) =>
                    setPlayers(players.map((v) => (v.id === p.id ? { ...v, number: e.target.value } : v)))
                  }
                />
              </label>
              <label className={w.field}>
                <span className={s.label}>Player {i + 1}</span>
                <input
                  className={s.input}
                  data-autofocus={i === 0 || undefined}
                  required
                  maxLength={120}
                  value={p.name}
                  onChange={(e) => {
                    setPlayers(players.map((v) => (v.id === p.id ? { ...v, name: e.target.value } : v)));
                    setFlags((current) => {
                      const next = { ...current };
                      delete next[p.id];
                      return next;
                    });
                  }}
                />
              </label>
              <button
                type="button"
                className={w.danger}
                aria-label={`Remove player ${i + 1}`}
                onClick={() => setPlayers(players.filter((v) => v.id !== p.id))}
              >
                Remove
              </button>
            </div>
            {flags[p.id] && (
              <p className={w.rosterFlag}>
                Review player {i + 1}: {flags[p.id]}
              </p>
            )}
          </div>
        ))}
        <div className={w.actions}>
          <button
            type="button"
            className={`${s.button} ${s.buttonQuiet}`}
            onClick={() => setPlayers([...players, { id: crypto.randomUUID(), name: '', number: '' }])}
          >
            Add player
          </button>
          <button className={`${s.button} ${s.buttonTeal}`}>Done</button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
