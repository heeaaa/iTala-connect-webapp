import type { ReportDefinition } from './model';

/** A saved filter opens the normal report builder, where the source is read again. */
export function presetUrl(definition: ReportDefinition): string {
  const params = new URLSearchParams({
    event: definition.eventId,
    template: definition.template,
    dateMode: definition.dateMode,
    preview: '1',
  });
  if (definition.divisionId) params.set('division', definition.divisionId);
  if (definition.teamId) params.set('team', definition.teamId);
  if (definition.playerId) params.set('player', definition.playerId);
  if (definition.gameIds?.[0]) params.set('game', definition.gameIds[0]);
  if (definition.dates.length) params.set('dates', definition.dates.join(','));
  if (definition.relative) params.set('relative', definition.relative);
  if (definition.standingsScope) params.set('standings', definition.standingsScope);
  if (definition.minAppearances !== undefined) params.set('minAppearances', String(definition.minAppearances));
  if (definition.minAttempts !== undefined) params.set('minAttempts', String(definition.minAttempts));
  return `/admin/reports?${params.toString()}`;
}
