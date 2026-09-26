import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no canvas, so the resizing step (proven in Chromium) is replaced;
// everything after it is the component's own behaviour.
const fake = vi.hoisted(() => ({ compress: vi.fn(), upload: vi.fn(), remove: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/compress-image', () => ({
  ImageProblem: class ImageProblem extends Error {},
  compressImage: fake.compress,
}));
vi.mock('@/server/actions/images', () => ({ uploadEventImage: fake.upload, removeEventImage: fake.remove }));
import { ImageProblem } from '@/lib/compress-image';
import { EventImages, type EventImagesData } from '@/app/admin/events/[eventId]/event-images';

const EVENT = '00000000-0000-4000-8000-000000000001';
const NONE: EventImagesData = { logo: null, major: null, minors: [] };
const SOME: EventImagesData = {
  logo: 'https://x.test/logo.webp',
  major: 'https://x.test/major.webp',
  minors: [
    { id: '00000000-0000-4000-8000-000000000071', url: 'https://x.test/a.webp' },
    { id: '00000000-0000-4000-8000-000000000072', url: 'https://x.test/b.webp' },
  ],
};
const png = (name = 'logo.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
const status = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite');
const renderImages = (images = NONE) => render(<EventImages eventId={EVENT} images={images} run={fake.run} />);

beforeEach(() => {
  vi.clearAllMocks();
  fake.compress.mockImplementation(async (f: File) => new Blob([await f.arrayBuffer()], { type: 'image/webp' }));
  fake.upload.mockResolvedValue({ ok: true, data: {} });
  fake.remove.mockResolvedValue({ ok: true, data: {} });
  // The editor's queue hands each task the version current when it runs.
  fake.run.mockImplementation((task: (version: string) => Promise<unknown>) => task('v1'));
});

describe('Event images (E-15 to E-18)', () => {
  it('says what is missing and offers the uploads', () => {
    renderImages();
    expect(screen.getByText('No logo yet.')).toBeInTheDocument();
    expect(screen.getByText('No major sponsor yet.')).toBeInTheDocument();
    expect(screen.getByText('No minor sponsors yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload logo')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Upload major sponsor')).not.toHaveAttribute('multiple');
    expect(screen.getByLabelText('Add minor sponsors')).toHaveAttribute('multiple');
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('resizes, then uploads through the save queue, and says so', async () => {
    const user = userEvent.setup();
    renderImages();
    const file = png();
    await user.upload(screen.getByLabelText('Upload logo'), file);
    expect(fake.compress).toHaveBeenCalledWith(file);
    expect(fake.run).toHaveBeenCalledTimes(1);
    const form = fake.upload.mock.lastCall![0] as FormData;
    expect(form.get('eventId')).toBe(EVENT);
    expect(form.get('kind')).toBe('logo');
    expect(form.get('version')).toBe('v1');
    expect((form.get('file') as Blob).type).toBe('image/webp');
    expect(status()).toHaveTextContent('Logo saved.');
  });

  it('shows the stored images with names, and replaces or removes them', async () => {
    const user = userEvent.setup();
    renderImages(SOME);
    expect(screen.getByRole('img', { name: 'Event logo' })).toHaveAttribute('src', SOME.logo);
    expect(screen.getByRole('img', { name: 'Major sponsor logo' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Minor sponsor logo/ })).toHaveLength(2);
    expect(screen.getByLabelText('Replace logo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove logo' }));
    expect(fake.remove).toHaveBeenLastCalledWith({ kind: 'logo', eventId: EVENT, version: 'v1' });
    expect(status()).toHaveTextContent('Logo removed.');
    // The Remove button goes with the image; focus moves to the slot's upload control.
    expect(screen.getByLabelText('Replace logo')).toHaveFocus();
    const second = within(screen.getByRole('list')).getAllByRole('listitem')[1]!;
    await user.click(within(second).getByRole('button', { name: /^Remove/ }));
    expect(fake.remove).toHaveBeenLastCalledWith({ kind: 'minor', eventId: EVENT, sponsorId: SOME.minors[1]!.id });
    expect(status()).toHaveTextContent('Minor sponsor removed.');
    expect(screen.getByLabelText('Add minor sponsors')).toHaveFocus();
  });

  it('adds several minor sponsors one after another, naming the one that failed', async () => {
    const user = userEvent.setup();
    renderImages();
    await user.upload(screen.getByLabelText('Add minor sponsors'), [png('a.png'), png('b.png')]);
    expect(fake.upload).toHaveBeenCalledTimes(2);
    expect(status()).toHaveTextContent('2 minor sponsors added.');
    fake.upload.mockResolvedValueOnce({ ok: true, data: {} });
    fake.upload.mockResolvedValueOnce({ ok: false, error: 'Upload failed: it could not be saved to the event.' });
    await user.upload(screen.getByLabelText('Add minor sponsors'), [png('a.png'), png('b.png'), png('c.png')]);
    expect(fake.upload).toHaveBeenCalledTimes(4);
    expect(status()).toHaveTextContent('Upload failed: it could not be saved to the event. (image 2)');
    expect(status()).toHaveAttribute('data-tone', 'error');
  });

  it('says why an image cannot be used, before anything is sent', async () => {
    const user = userEvent.setup();
    fake.compress.mockRejectedValueOnce(new ImageProblem('the image is larger than 5 MB.'));
    renderImages();
    await user.upload(screen.getByLabelText('Upload major sponsor'), png());
    expect(status()).toHaveTextContent('Upload failed: the image is larger than 5 MB.');
    expect(fake.upload).not.toHaveBeenCalled();
    fake.compress.mockRejectedValueOnce(new Error('canvas exploded'));
    await user.upload(screen.getByLabelText('Upload major sponsor'), png());
    expect(status()).toHaveTextContent('Upload failed: this image could not be prepared.');
  });

  it('reports a refused upload or a lost connection', async () => {
    const user = userEvent.setup();
    renderImages(SOME);
    fake.upload.mockResolvedValueOnce({ ok: false, error: 'You can only edit your own events.' });
    await user.upload(screen.getByLabelText('Replace logo'), png());
    expect(status()).toHaveTextContent('You can only edit your own events.');
    fake.upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.upload(screen.getByLabelText('Replace logo'), png());
    expect(status()).toHaveTextContent('Upload failed: the server could not be reached. Check your connection.');
    fake.remove.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Remove major sponsor' }));
    expect(status()).toHaveTextContent('Could not remove the image. Check your connection.');
  });
});
