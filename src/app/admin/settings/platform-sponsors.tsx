'use client';
import { useId, useRef, useState } from 'react';
import { ImageProblem, compressImage } from '@/lib/compress-image';
import { uploadFailed, type PlatformTier } from '@/lib/event-images';
import { removePlatformSponsor, uploadPlatformSponsor } from '@/server/actions/platform';
import { ImagePick } from '../_components/image-pick';
import w from '../admin-workspace.module.css';

export interface PlatformSponsor {
  id: string;
  url: string;
}

type Result = { ok: true } | { ok: false; error: string };
type Status = { tone: 'busy' | 'done' | 'error'; text: string } | null;

const TIERS: Record<PlatformTier, { title: string; size: string; one: string }> = {
  primary: { title: 'Primary sponsors', size: 'Full size on every event page.', one: 'primary sponsor' },
  secondary: { title: 'Secondary sponsors', size: 'Half size on every event page.', one: 'secondary sponsor' },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Platform sponsors (PRD S-01): primary and secondary logos shown on every
 * event page. Several can be added at once; each is checked and resized in
 * the browser like event images (E-18), saved straight away, and removing one
 * deletes its file.
 */
export function PlatformSponsors({ sponsors }: { sponsors: Record<PlatformTier, PlatformSponsor[]> }) {
  const [status, setStatus] = useState<Status>(null);
  const primaryId = useId();
  const secondaryId = useId();
  const primaryPick = useRef<HTMLInputElement>(null);
  const secondaryPick = useRef<HTMLInputElement>(null);
  const picks = { primary: primaryPick, secondary: secondaryPick };
  const ids = { primary: primaryId, secondary: secondaryId };

  const send = async (tier: PlatformTier, file: File): Promise<Result> => {
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch (e) {
      return {
        ok: false,
        error: uploadFailed(e instanceof ImageProblem ? e.message : 'this image could not be prepared.'),
      };
    }
    const form = new FormData();
    form.set('tier', tier);
    form.set('file', blob, 'image');
    try {
      return await uploadPlatformSponsor(form);
    } catch {
      return { ok: false, error: uploadFailed('the server could not be reached. Check your connection.') };
    }
  };

  const upload = async (tier: PlatformTier, files: File[]) => {
    for (const [i, file] of files.entries()) {
      setStatus({
        tone: 'busy',
        text: files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : `Uploading ${TIERS[tier].one}…`,
      });
      const result = await send(tier, file);
      if (!result.ok) {
        setStatus({ tone: 'error', text: files.length > 1 ? `${result.error} (image ${i + 1})` : result.error });
        return;
      }
    }
    setStatus({ tone: 'done', text: `${plural(files.length, TIERS[tier].one)} added.` });
  };

  const remove = async (tier: PlatformTier, sponsorId: string) => {
    setStatus({ tone: 'busy', text: 'Removing…' });
    let result: Result;
    try {
      result = await removePlatformSponsor(sponsorId);
    } catch {
      result = { ok: false, error: 'Could not remove the sponsor. Check your connection.' };
    }
    if (!result.ok) {
      setStatus({ tone: 'error', text: result.error });
      return;
    }
    const one = TIERS[tier].one;
    setStatus({ tone: 'done', text: `${one[0]!.toUpperCase()}${one.slice(1)} removed.` });
    // The Remove button went with the logo; the tier's upload control takes focus.
    picks[tier].current?.focus();
  };

  const tier = (t: PlatformTier) => (
    <section aria-labelledby={ids[t]} className={w.imageSlot}>
      <h3 id={ids[t]}>{TIERS[t].title}</h3>
      <p className={w.note}>{TIERS[t].size}</p>
      {sponsors[t].length ? (
        <ul className={w.sponsorGrid}>
          {sponsors[t].map((sponsor, i) => (
            <li key={sponsor.id}>
              {/* Plain img: previews straight from storage, already resized on upload. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sponsor.url} alt={`${TIERS[t].title.slice(0, -1)} logo ${i + 1}`} className={w.sponsorThumb} />
              {/* The name starts with the visible word, so voice control still finds "Remove". */}
              <button
                type="button"
                className={w.danger}
                aria-label={`Remove ${TIERS[t].one} ${i + 1}`}
                onClick={() => remove(t, sponsor.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={w.note}>No {TIERS[t].one}s yet.</p>
      )}
      <div className={w.actions}>
        <ImagePick label={`Add ${TIERS[t].one}s`} multiple inputRef={picks[t]} onPick={(files) => upload(t, files)} />
      </div>
    </section>
  );

  return (
    <div className={w.stack}>
      <p className={w.note}>
        Images save as soon as they upload. PNG, JPEG or WebP up to 5 MB; larger pictures are resized to 1600 pixels.
      </p>
      {tier('primary')}
      {tier('secondary')}
      <p aria-live="polite" className={w.imageStatus} data-tone={status?.tone}>
        {status?.text}
      </p>
    </div>
  );
}
