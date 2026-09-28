'use client';
import { useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ImageProblem, compressImage } from '@/lib/compress-image';
import { uploadFailed, type ImageKind } from '@/lib/event-images';
import { platformStyles as s } from '@/components/platform/platform-frame';
import {
  removeEventImage,
  setEventBannerFocus,
  setEventSponsorDisplayMode,
  uploadEventImage,
  type ImageOutcome,
  type RemoveImageInput,
} from '@/server/actions/images';
import { ImagePick as Pick } from '../../_components/image-pick';
import w from '../../admin-workspace.module.css';

export interface EventImagesData {
  logo: string | null;
  banner?: string | null;
  bannerFocus?: 'left' | 'center' | 'right';
  major: string | null;
  minors: { id: string; url: string; displayMode?: 'light' | 'dark' }[];
  majorDisplayMode?: 'light' | 'dark';
}

type Result = { ok: true; data: ImageOutcome } | { ok: false; error: string };
/**
 * Runs an image change after any save in progress, handing it the editor's
 * version at that moment, and adopts the event's new version when one comes back.
 */
export type RunImageTask = (task: (version: string) => Promise<Result>) => Promise<Result>;

type Status = { tone: 'busy' | 'done' | 'error'; text: string } | null;

const NAMES: Record<ImageKind, string> = {
  logo: 'Logo',
  banner: 'Event banner',
  major: 'Major sponsor',
  minor: 'Minor sponsor',
};

/**
 * Event logo, major sponsor and minor sponsors (PRD E-15 to E-18). Each
 * image is checked and resized in the browser (at most 5 MB, 1600 px), then
 * saved straight away; replacing or removing one deletes its file.
 */
export function EventImages({ eventId, images, run }: { eventId: string; images: EventImagesData; run: RunImageTask }) {
  const [status, setStatus] = useState<Status>(null);
  const [bannerFocus, setBannerFocus] = useState<'left' | 'center' | 'right'>(images.bannerFocus ?? 'center');
  const [majorMode, setMajorMode] = useState<'light' | 'dark'>(images.majorDisplayMode ?? 'light');
  const [minorModes, setMinorModes] = useState<Record<string, 'light' | 'dark'>>(() =>
    Object.fromEntries(images.minors.map((m) => [m.id, m.displayMode ?? 'light'])),
  );
  const logoId = useId();
  const bannerId = useId();
  const majorId = useId();
  const minorId = useId();
  const logoPick = useRef<HTMLInputElement>(null);
  const bannerPick = useRef<HTMLInputElement>(null);
  const majorPick = useRef<HTMLInputElement>(null);
  const minorPick = useRef<HTMLInputElement>(null);
  const picks = { logo: logoPick, banner: bannerPick, major: majorPick, minor: minorPick };

  const send = async (kind: ImageKind, file: File): Promise<Result> => {
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
    form.set('eventId', eventId);
    form.set('kind', kind);
    form.set('file', blob, 'image');
    try {
      return await run((version) => {
        form.set('version', version);
        return uploadEventImage(form);
      });
    } catch {
      return { ok: false, error: uploadFailed('the server could not be reached. Check your connection.') };
    }
  };

  const upload = async (kind: ImageKind, files: File[]) => {
    for (const [i, file] of files.entries()) {
      setStatus({
        tone: 'busy',
        text: files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : `Uploading ${NAMES[kind].toLowerCase()}…`,
      });
      const result = await send(kind, file);
      if (!result.ok) {
        setStatus({ tone: 'error', text: files.length > 1 ? `${result.error} (image ${i + 1})` : result.error });
        return;
      }
    }
    setStatus({
      tone: 'done',
      text:
        kind === 'minor'
          ? `${files.length} minor sponsor${files.length === 1 ? '' : 's'} added.`
          : `${NAMES[kind]} saved.`,
    });
  };

  const remove = async (input: RemoveImageInput) => {
    setStatus({ tone: 'busy', text: 'Removing…' });
    let result: Result;
    try {
      result = await run((version) => removeEventImage(input.kind === 'minor' ? input : { ...input, version }));
    } catch {
      result = { ok: false, error: 'Could not remove the image. Check your connection.' };
    }
    setStatus(
      result.ok ? { tone: 'done', text: `${NAMES[input.kind]} removed.` } : { tone: 'error', text: result.error },
    );
    // The Remove button went with the image; its slot's upload control takes focus.
    if (result.ok) picks[input.kind].current?.focus();
  };

  const changeSponsorMode = async (input: { kind: 'major' | 'minor'; sponsorId?: string; mode: 'light' | 'dark' }) => {
    const previous = input.kind === 'major' ? majorMode : minorModes[input.sponsorId!];
    if (input.kind === 'major') setMajorMode(input.mode);
    else setMinorModes((m) => ({ ...m, [input.sponsorId!]: input.mode }));
    setStatus({ tone: 'busy', text: 'Saving sponsor backing…' });
    try {
      const result = await setEventSponsorDisplayMode({
        eventId,
        kind: input.kind,
        ...(input.sponsorId ? { sponsorId: input.sponsorId } : {}),
        displayMode: input.mode,
      });
      if (!result.ok) throw new Error(result.error);
      setStatus({ tone: 'done', text: 'Sponsor backing saved.' });
    } catch (e) {
      if (input.kind === 'major') setMajorMode(previous as 'light' | 'dark');
      else setMinorModes((m) => ({ ...m, [input.sponsorId!]: previous as 'light' | 'dark' }));
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Could not update the sponsor backing.' });
    }
  };

  const changeBannerFocus = async (focus: 'left' | 'center' | 'right') => {
    const previous = bannerFocus;
    setBannerFocus(focus);
    setStatus({ tone: 'busy', text: 'Saving banner focal point…' });
    try {
      const result = await run((version) => setEventBannerFocus({ eventId, focus, version }));
      if (!result.ok) throw new Error(result.error);
      setStatus({ tone: 'done', text: 'Banner focal point saved.' });
    } catch (e) {
      setBannerFocus(previous);
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save the banner focal point.' });
    }
  };

  const single = (kind: 'logo' | 'major', id: string, url: string | null) => (
    <section aria-labelledby={id} className={w.imageSlot}>
      <h3 id={id}>{NAMES[kind]}</h3>
      {url ? (
        // Plain img: previews of the organiser's own uploads, straight from storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={kind === 'logo' ? 'Event logo' : 'Major sponsor logo'} className={w.imagePreview} />
      ) : (
        <p className={w.note}>No {NAMES[kind].toLowerCase()} yet.</p>
      )}
      <div className={w.actions}>
        <Pick
          label={url ? `Replace ${NAMES[kind].toLowerCase()}` : `Upload ${NAMES[kind].toLowerCase()}`}
          inputRef={picks[kind]}
          onPick={(files) => upload(kind, files.slice(0, 1))}
        />
        {url && (
          <button type="button" className={w.danger} onClick={() => remove({ kind, eventId })}>
            Remove {NAMES[kind].toLowerCase()}
          </button>
        )}
      </div>
      {kind === 'major' && url ? (
        <label className={w.field}>
          <span className={s.label}>Logo backing</span>
          <select
            className={w.input}
            value={majorMode}
            onChange={(e) => changeSponsorMode({ kind: 'major', mode: e.target.value as 'light' | 'dark' })}
          >
            <option value="light">Light plaque</option>
            <option value="dark">Dark plaque</option>
          </select>
        </label>
      ) : null}
    </section>
  );

  return (
    <div className={w.stack}>
      <p className={w.note}>
        Images save as soon as they upload. PNG, JPEG or WebP up to 5 MB; larger pictures are resized to 1600 pixels.
      </p>
      <section aria-labelledby={bannerId} className={w.imageSlot}>
        <h3 id={bannerId}>Event banner</h3>
        <p className={w.note}>Use a wide decorative image without important text. It crops responsively on phones.</p>
        {images.banner ? (
          <div className={w.bannerPreviews} style={{ '--banner-focus': bannerFocus } as CSSProperties}>
            <div className={w.bannerPreviewGroup}>
              <span>Desktop</span>
              <div className={w.bannerPreview} role="img" aria-label="Desktop banner preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={images.banner} alt="" />
              </div>
            </div>
            <div className={w.bannerPreviewGroup}>
              <span>Mobile</span>
              <div
                className={`${w.bannerPreview} ${w.bannerPreviewMobile}`}
                role="img"
                aria-label="Mobile banner preview"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={images.banner} alt="" />
              </div>
            </div>
          </div>
        ) : (
          <p className={w.note}>No event banner yet.</p>
        )}
        <div className={w.actions}>
          <Pick
            label={images.banner ? 'Replace event banner' : 'Upload event banner'}
            inputRef={bannerPick}
            onPick={(files) => upload('banner', files.slice(0, 1))}
          />
          {images.banner ? (
            <button type="button" className={w.danger} onClick={() => remove({ kind: 'banner', eventId })}>
              Remove event banner
            </button>
          ) : null}
        </div>
        {images.banner ? (
          <label className={w.field}>
            <span className={s.label}>Banner focal point</span>
            <select
              className={w.input}
              value={bannerFocus}
              onChange={(e) => changeBannerFocus(e.target.value as 'left' | 'center' | 'right')}
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </label>
        ) : null}
      </section>
      {single('logo', logoId, images.logo)}
      {single('major', majorId, images.major)}
      <section aria-labelledby={minorId} className={w.imageSlot}>
        <h3 id={minorId}>Minor sponsors</h3>
        {images.minors.length ? (
          <ul className={w.sponsorGrid}>
            {images.minors.map((m, i) => (
              <li key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={`Minor sponsor logo ${i + 1}`} className={w.sponsorThumb} />
                <label className={w.field}>
                  <span className="sr-only">Logo backing for minor sponsor {i + 1}</span>
                  <select
                    className={w.input}
                    value={minorModes[m.id] ?? 'light'}
                    onChange={(e) =>
                      changeSponsorMode({ kind: 'minor', sponsorId: m.id, mode: e.target.value as 'light' | 'dark' })
                    }
                  >
                    <option value="light">Light plaque</option>
                    <option value="dark">Dark plaque</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={w.danger}
                  onClick={() => remove({ kind: 'minor', eventId, sponsorId: m.id })}
                >
                  Remove<span className="sr-only"> minor sponsor {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={w.note}>No minor sponsors yet.</p>
        )}
        <div className={w.actions}>
          <Pick label="Add minor sponsors" multiple inputRef={minorPick} onPick={(files) => upload('minor', files)} />
        </div>
      </section>
      <p aria-live="polite" className={w.imageStatus} data-tone={status?.tone}>
        {status?.text}
      </p>
    </div>
  );
}
