import type { Metadata } from 'next';

import { clientEnv } from '@/env.client';
import { imageUrl } from '@/lib/public-event/model';
import { isEmptyRules, sanitizeRulesHtml } from '@/lib/rules-html';
import { createClient } from '@/lib/supabase/server';
import { requireSuperadmin } from '@/server/auth';
import { DEFAULT_RULES_HTML } from '@/server/event-defaults';

import { SettingsView, type PlatformSponsor } from './settings-view';

export const metadata: Metadata = { title: 'Settings' };

// Superadmin only: platform sponsors and the default rules template (PRD S-01, S-02).
export default async function SettingsPage() {
  await requireSuperadmin();
  const supabase = await createClient();
  const [sponsors, settings] = await Promise.all([
    supabase.from('platform_sponsors').select('id, tier, image_path').order('sort_order').order('created_at'),
    supabase.from('platform_settings').select('default_rules_html').eq('id', true).maybeSingle(),
  ]);
  const supabaseUrl = clientEnv().NEXT_PUBLIC_SUPABASE_URL;
  const tier = (t: string): PlatformSponsor[] =>
    (sponsors.data ?? [])
      .filter((s) => s.tier === t)
      .map((s) => ({ id: s.id, url: imageUrl(supabaseUrl, s.image_path)! }));
  // New events copy the stored template, or the built-in rules when it is empty (create_draft_event).
  const stored = sanitizeRulesHtml(settings.data?.default_rules_html);

  return (
    <SettingsView
      error={Boolean(sponsors.error || settings.error)}
      sponsors={{ primary: tier('primary'), secondary: tier('secondary') }}
      rules={isEmptyRules(stored) ? '' : stored}
      builtInRules={DEFAULT_RULES_HTML}
    />
  );
}
