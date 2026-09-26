import { z } from 'zod';
import { isValidTimeZone } from '@/env.schema';

export const DIVISION_COLOURS = ['#6C63FF', '#2BBF8A', '#E06040', '#D4A017', '#E06098', '#3BACDF'] as const;
const name = z.string().trim().min(1).max(120);
const colour = z.string().regex(/^#[\da-f]{6}$/i);
const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((v) => Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60);
const day = z.iso.date();
export const playerEditSchema = z.object({ id: z.uuid(), name, number: z.string().max(10) });
export const teamEditSchema = z.object({
  id: z.uuid(),
  name,
  coach: z.string().trim().max(120),
  players: z.array(playerEditSchema).max(200),
});
export const divisionEditSchema = z.object({
  id: z.uuid(),
  name,
  color: colour,
  bracket_count: z.number().int().min(1).max(4),
  custom_games_per_team: z.boolean(),
  games_per_team: z.number().int().min(0).max(20),
  teams: z.array(teamEditSchema).max(200),
});
export const editorSchema = z
  .object({
    id: z.uuid(),
    version: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    schedule_days: z
      .array(day)
      .max(100)
      .refine((v) => new Set(v).size === v.length, 'Choose each date once.'),
    time_start: time,
    time_end: time,
    courts: z.number().int().min(1).max(10),
    court_names: z.array(z.string().trim().min(1).max(120)),
    timezone: z.string().refine(isValidTimeZone),
    theme_primary: colour,
    theme_bg: colour,
    theme_text: colour,
    theme_text_secondary: colour,
    theme_heading: colour,
    divisions: z.array(divisionEditSchema).max(30),
  })
  .refine((v) => v.time_end > v.time_start, 'End time must be after start time.')
  .refine((v) => v.court_names.length === v.courts, 'Name each court.')
  .refine((v) => {
    const ids = v.divisions.flatMap((d) => [d.id, ...d.teams.flatMap((t) => [t.id, ...t.players.map((p) => p.id)])]);
    return new Set(ids).size === ids.length;
  }, 'Each division, team and player must have a unique identity.');
export type EditorInput = z.infer<typeof editorSchema>;
export type EditorDivision = EditorInput['divisions'][number];
export type EditorTeam = EditorDivision['teams'][number];
