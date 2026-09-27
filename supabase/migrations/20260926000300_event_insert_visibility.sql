-- INSERT ... RETURNING must evaluate ownership on the new row itself.
-- is_event_editor(id) re-reads events through a stable function; that snapshot
-- cannot see the row being inserted and rejected an admin's own draft.
drop policy events_select on public.events;
create policy events_select on public.events for select to anon, authenticated
using (status = 'published' or public.is_superadmin()
  or (public.is_active_admin() and owner_id = (select auth.uid())));
