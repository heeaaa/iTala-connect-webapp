import { syncMobileLinks } from '../../src/server/mobile/link-sync-worker';

export default async function syncMobileLinkJob() {
  const result = await syncMobileLinks({
    connectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    connectKey: process.env.SUPABASE_SECRET_KEY,
    mobileUrl: process.env.MOBILE_SUPABASE_URL,
    secret: process.env.CONNECT_LINK_SYNC_SECRET,
  });
  console.log('Mobile link sync', result);
  return new Response(JSON.stringify(result), { status: result.configured ? 200 : 503 });
}

export const config = { schedule: '*/5 * * * *' };
