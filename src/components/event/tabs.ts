/** Public event page tabs (PRD P-03). Shared by server routes and the client tab bar. */
export const EVENT_TABS = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams', label: 'Teams' },
  { id: 'rules', label: 'Rules' },
] as const;

export type EventTabId = (typeof EVENT_TABS)[number]['id'];

export function parseEventTab(value: string | string[] | undefined): EventTabId {
  return EVENT_TABS.find((t) => t.id === value)?.id ?? 'schedule';
}
