import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no canvas, so the resizing step (proven in Chromium) is replaced;
// everything after it is the component's own behaviour.
const fake = vi.hoisted(() => ({ compress: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/compress-image', () => ({
  ImageProblem: class ImageProblem extends Error {},
  compressImage: fake.compress,
}));
vi.mock('@/server/actions/platform', () => ({
  uploadPlatformSponsor: fake.upload,
  removePlatformSponsor: fake.remove,
}));
import { ImageProblem } from '@/lib/compress-image';
import { PlatformSponsors, type PlatformSponsor } from '@/app/admin/settings/platform-sponsors';

const NONE = { primary: [] as PlatformSponsor[], secondary: [] as PlatformSponsor[] };
const SOME = {
  primary: [
    { id: '00000000-0000-4000-8000-000000000081', url: 'https://x.test/p1.webp' },
    { id: '00000000-0000-4000-8000-000000000082', url: 'https://x.test/p2.webp' },
  ],
  secondary: [{ id: '00000000-0000-4000-8000-000000000091', url: 'https://x.test/s1.webp' }],
};
const png = (name = 'logo.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
const status = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite');

beforeEach(() => {
  vi.clearAllMocks();
  fake.compress.mockImplementation(async (f: File) => new Blob([await f.arrayBuffer()], { type: 'image/webp' }));
  fake.upload.mockResolvedValue({ ok: true, data: undefined });
  fake.remove.mockResolvedValue({ ok: true, data: undefined });
});

describe('Platform sponsors (S-01)', () => {
  it('names both tiers with their size, says when they are empty and takes several files', () => {
    render(<PlatformSponsors sponsors={NONE} />);
    expect(screen.getByRole('heading', { name: 'Primary sponsors' })).toBeInTheDocument();
    expect(screen.getByText('Full size on every event page.')).toBeInTheDocument();
    expect(screen.getByText('Half size on every event page.')).toBeInTheDocument();
    expect(screen.getByText('No primary sponsors yet.')).toBeInTheDocument();
    expect(screen.getByText('No secondary sponsors yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add primary sponsors')).toHaveAttribute('multiple');
    expect(screen.getByLabelText('Add secondary sponsors')).toHaveAttribute('multiple');
  });

  it('resizes and uploads each file to its tier, one after another, and says how many were added', async () => {
    const user = userEvent.setup();
    render(<PlatformSponsors sponsors={NONE} />);
    await user.upload(screen.getByLabelText('Add secondary sponsors'), [png('a.png'), png('b.png')]);
    expect(fake.compress).toHaveBeenCalledTimes(2);
    expect(fake.upload).toHaveBeenCalledTimes(2);
    const sent = fake.upload.mock.calls.map(([f]) => f as FormData);
    expect(sent.map((f) => f.get('tier'))).toEqual(['secondary', 'secondary']);
    expect((sent[0]!.get('file') as Blob).type).toBe('image/webp');
    expect(status()).toHaveTextContent('2 secondary sponsors added.');
    await user.upload(screen.getByLabelText('Add primary sponsors'), png());
    expect(status()).toHaveTextContent('1 primary sponsor added.');
  });

  it('shows each sponsor with a name, removes one and puts focus on that tier’s upload control', async () => {
    const user = userEvent.setup();
    render(<PlatformSponsors sponsors={SOME} />);
    expect(screen.getAllByRole('img', { name: /^Primary sponsor logo/ })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Secondary sponsor logo 1' })).toHaveAttribute(
      'src',
      SOME.secondary[0]!.url,
    );
    const primary = screen.getByRole('heading', { name: 'Primary sponsors' }).closest('section')!;
    await user.click(within(primary).getByRole('button', { name: 'Remove primary sponsor 2' }));
    expect(fake.remove).toHaveBeenCalledWith(SOME.primary[1]!.id);
    expect(status()).toHaveTextContent('Primary sponsor removed.');
    expect(screen.getByLabelText('Add primary sponsors')).toHaveFocus();
  });

  it('says why an image cannot be used, names the one that failed, and reports a lost connection', async () => {
    const user = userEvent.setup();
    render(<PlatformSponsors sponsors={SOME} />);
    fake.compress.mockRejectedValueOnce(new ImageProblem('the image is larger than 5 MB.'));
    await user.upload(screen.getByLabelText('Add primary sponsors'), png());
    expect(status()).toHaveTextContent('Upload failed: the image is larger than 5 MB.');
    expect(status()).toHaveAttribute('data-tone', 'error');
    expect(fake.upload).not.toHaveBeenCalled();
    fake.upload.mockResolvedValueOnce({ ok: true, data: undefined });
    fake.upload.mockResolvedValueOnce({ ok: false, error: 'Only a superadmin can do this.' });
    await user.upload(screen.getByLabelText('Add primary sponsors'), [png('a.png'), png('b.png'), png('c.png')]);
    expect(fake.upload).toHaveBeenCalledTimes(2);
    expect(status()).toHaveTextContent('Only a superadmin can do this. (image 2)');
    fake.upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.upload(screen.getByLabelText('Add secondary sponsors'), png());
    expect(status()).toHaveTextContent('Upload failed: the server could not be reached. Check your connection.');
    fake.remove.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Remove secondary sponsor 1' }));
    expect(status()).toHaveTextContent('Could not remove the sponsor. Check your connection.');
    fake.remove.mockResolvedValueOnce({ ok: false, error: 'Could not remove the sponsor. Refresh and try again.' });
    await user.click(screen.getByRole('button', { name: 'Remove secondary sponsor 1' }));
    expect(status()).toHaveTextContent('Could not remove the sponsor. Refresh and try again.');
  });
});
