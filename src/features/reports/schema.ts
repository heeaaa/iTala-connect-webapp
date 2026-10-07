import { z } from 'zod';

const template = z.enum(['box-score', 'league', 'team', 'results', 'leaders', 'player-log']);
const id = z.uuid();
const mobilePlayerId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

export const reportDefinitionSchema = z.strictObject({
  eventId: id,
  template,
  divisionId: id.optional(),
  teamId: id.optional(),
  playerId: mobilePlayerId.optional(),
  dateMode: z.enum(['all', 'day', 'range', 'dates']),
  dates: z.array(z.iso.date()).max(100),
  gameIds: z.array(id).max(100).optional(),
  relative: z.enum(['latest', 'last-five']).optional(),
  standingsScope: z.enum(['through-cutoff', 'selected-games']).optional(),
  minAppearances: z.int().min(0).max(1000).optional(),
  minAttempts: z.int().min(0).max(1000).optional(),
  allStats: z.boolean().optional(),
});

const cell = z.union([z.string().max(2000), z.number().finite(), z.null()]);

/** Validate stored JSON before it is displayed or passed to an export encoder. */
export const reportDocumentSchema = z.strictObject({
  version: z.literal(1),
  template,
  title: z.string().max(300),
  eventId: id,
  eventName: z.string().max(300),
  timezone: z.string().max(100),
  generatedAt: z.iso.datetime(),
  sourceReadAt: z.iso.datetime(),
  // A selection is at most 100 included games, but may cover more games than that (unscored ones,
  // or before "latest" or "last five" picks), so the selected count and left-out list run higher.
  selectedCount: z.int().min(0).max(100000),
  includedCount: z.int().min(0).max(100),
  gameIds: z.array(id).max(100),
  exclusions: z
    .array(z.strictObject({ gameId: id, label: z.string().max(300).optional(), reason: z.string().max(500) }))
    .max(5000),
  notes: z.array(z.string().max(2000)).max(200),
  tables: z
    .array(
      z.strictObject({
        title: z.string().max(300),
        columns: z
          .array(
            z.strictObject({ key: z.string().max(100), label: z.string().max(200), kind: z.enum(['text', 'number']) }),
          )
          .max(60),
        rows: z.array(z.record(z.string().max(100), cell)).max(10000),
      }),
    )
    .max(200),
});
