import Link from 'next/link';

// Placeholder home. The published events grid (PRD H-01 to H-05) and the
// legacy #/event/{id} redirect are built in phase 4 on the approved design.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">iTala Connect</h1>
      <p className="text-brand-muted">Tournament schedules, live scores and standings for community basketball.</p>
      <p>
        <Link href="/login" className="text-brand-accent underline underline-offset-4">
          Organiser sign in
        </Link>
      </p>
    </main>
  );
}
