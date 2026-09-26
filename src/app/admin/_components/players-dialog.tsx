'use client';
import { useState, useEffect, useRef } from 'react';
import type { EditorTeam } from '@/lib/event-editor';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../admin-workspace.module.css';
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
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
        onSubmit={(e) => {
          e.preventDefault();
          onDone(players);
        }}
      >
        {players.map((p, i) => (
          <div key={p.id} className={w.playerRow}>
            <label className={w.field}>
              <span className={s.label}>Number {i + 1}</span>
              <input
                className={s.input}
                value={p.number}
                maxLength={10}
                onChange={(e) => setPlayers(players.map((v) => (v.id === p.id ? { ...v, number: e.target.value } : v)))}
              />
            </label>
            <label className={w.field}>
              <span className={s.label}>Player {i + 1}</span>
              <input
                autoFocus={i === 0}
                className={s.input}
                required
                maxLength={120}
                value={p.name}
                onChange={(e) => setPlayers(players.map((v) => (v.id === p.id ? { ...v, name: e.target.value } : v)))}
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
