'use client';
import { useId, useRef, useState, type RefObject } from 'react';
import { ImageProblem, compressImage } from '@/lib/compress-image';
import { uploadFailed, type ImageKind } from '@/lib/event-images';
import { removeEventImage, uploadEventImage, type ImageOutcome, type RemoveImageInput } from '@/server/actions/images';
import { platformStyles as s } from '@/components/platform/platform-frame';
import w from '../../admin-workspace.module.css';

export interface EventImagesData {
  logo: string | null;
  major: string | null;
  minors: { id: string; url: string }[];
}

type Result = { ok: true; data: ImageOutcome } | { ok: false; error: string };
/**
 * Runs an image change after any save in progress, handing it the editor's
 * version at that moment, and adopts the event's new version when one comes back.
 */
export type RunImageTask = (task: (version: string) => Promise<Result>) => Promise<Result>;

type Status = { tone: 'busy' | 'done' | 'error'; text: string } | null;

const NAMES: Record<ImageKind, string> = { logo: 'Logo', major: 'Major sponsor', minor: 'Minor sponsor' };

/** A button that opens the file picker: the real input stays focusable and takes the label as its name. */
function Pick({
  label,
  multiple,
  inputRef,
  onPick,
}: {
  label: string;
  multiple?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (files: File[]) => void;
}) {
  return (
    <label className={`${s.button} ${s.buttonQuiet} ${w.pick}`}>
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared, so choosing the same file again still counts as a change.
          e.target.value = '';
          if (files.length) onPick(files);
        }}
      />
    </label>
  );
}

/**
 * Event logo, major sponsor and minor sponsors (PRD E-15 to E-18). Each
 * image is checked and resized in the browser (at most 5 MB, 1600 px), then
 * saved straight away; replacing or removing one deletes its file.
 */
export function EventImages({ eventId, images, run }: { eventId: string; images: EventImagesData; run: RunImageTask }) {
  const [status, setStatus] = useState<Status>(null);
  const logoId = useId();
  const majorId = useId();
  const minorId = useId();
  const logoPick = useRef<HTMLInputElement>(null);
  const majorPick = useRef<HTMLInputElement>(null);
  const minorPick = useRef<HTMLInputElement>(null);
  const picks = { logo: logoPick, major: majorPick, minor: minorPick };

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

  const single = (kind: 'logo' | 'major', id: string, url: string | null) => (
    <section aria-labelledby={id} className={w.imageSlot}>
      <h3 id={id}>{kind === 'logo' ? 'Event logo' : 'Major sponsor'}</h3>
      {url ? (
        // Plain img: previews of the organiser's own uploads, straight from storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={kind === 'logo' ? 'Event logo' : 'Major sponsor logo'} className={w.imagePreview} />
      ) : (
        <p className={w.note}>{kind === 'logo' ? 'No logo yet.' : 'No major sponsor yet.'}</p>
      )}
      <div className={w.actions}>
        <Pick
          label={
            url
              ? `Replace ${kind === 'logo' ? 'logo' : 'major sponsor'}`
              : `Upload ${kind === 'logo' ? 'logo' : 'major sponsor'}`
          }
          inputRef={picks[kind]}
          onPick={(files) => upload(kind, files.slice(0, 1))}
        />
        {url && (
          <button type="button" className={w.danger} onClick={() => remove({ kind, eventId })}>
            Remove {kind === 'logo' ? 'logo' : 'major sponsor'}
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div className={w.stack}>
      <p className={w.note}>
        Images save as soon as they upload. PNG, JPEG or WebP up to 5 MB; larger pictures are resized to 1600 pixels.
      </p>
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
