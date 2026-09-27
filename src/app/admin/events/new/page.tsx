import { TitlePlate } from '@/components/platform/platform-frame';
import { serverEnv } from '@/env';
import { clientEnv } from '@/env.client';
import { slugYear } from '@/lib/event-slug';
import { requireAdmin } from '@/server/auth';
import { NewEventForm } from './new-event-form';
export default async function NewEventPage() {
  await requireAdmin('/admin/events/new');
  return (
    <>
      <TitlePlate title="New event" sub="Start with a draft" />
      <NewEventForm
        year={slugYear([], new Date(), serverEnv().DEFAULT_EVENT_TIMEZONE)}
        siteUrl={clientEnv().NEXT_PUBLIC_SITE_URL}
      />
    </>
  );
}
