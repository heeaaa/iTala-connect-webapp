import { TitlePlate } from '@/components/platform/platform-frame';
import { requireAdmin } from '@/server/auth';
import { NewEventForm } from './new-event-form';
export default async function NewEventPage() {
  await requireAdmin('/admin/events/new');
  return (
    <>
      <TitlePlate title="New event" sub="Start with a draft" />
      <NewEventForm />
    </>
  );
}
