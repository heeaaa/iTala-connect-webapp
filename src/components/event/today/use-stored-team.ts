'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * The spectator's team, remembered on this device per event (Today brief:
 * pick once). Storage can be blocked (private mode), so every access is
 * guarded and the choice falls back to memory until the page reloads.
 */
const CHANGE = 'itala:stored-team';
const memory = new Map<string, string>();

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    if (value) memory.set(key, value);
    else memory.delete(key);
  }
}

export function useStoredTeam(eventId: string): [string | null, (teamId: string | null) => void] {
  const key = `itala:team:${eventId}`;
  const teamId = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const setTeamId = useCallback(
    (next: string | null) => {
      write(key, next);
      window.dispatchEvent(new Event(CHANGE));
    },
    [key],
  );
  return [teamId, setTeamId];
}
