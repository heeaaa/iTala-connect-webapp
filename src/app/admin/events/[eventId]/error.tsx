'use client';
import { platformStyles as s, TitlePlate } from '@/components/platform/platform-frame';
export default function EditorError({ reset }: { reset: () => void }) {
  return (
    <>
      <TitlePlate title="Could not load event" sub="Please try again" />
      <button className={`${s.button} ${s.buttonTeal}`} onClick={reset}>
        Retry
      </button>
    </>
  );
}
