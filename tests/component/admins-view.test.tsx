import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({ create: vi.fn(), link: vi.fn(), role: vi.fn(), disable: vi.fn() }));
vi.mock('@/server/actions/admins', () => ({
  createAdminAccount: fake.create,
  newSetupLink: fake.link,
  setAdminRole: fake.role,
  setAdminDisabled: fake.disable,
}));
import { AdminsView, type AdminAccount } from '@/app/admin/admins/admins-view';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const SELF = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const JO = '00000000-0000-4000-8000-000000000003';
const ACCOUNTS: AdminAccount[] = [
  {
    id: SELF,
    display_name: 'Aroha Super',
    email: 'aroha@example.com',
    role: 'superadmin',
    disabled_at: null,
    signed_in: true,
  },
  { id: SAM, display_name: 'Sam Lee', email: 'sam@example.com', role: 'admin', disabled_at: null, signed_in: false },
  {
    id: JO,
    display_name: 'Jo Brown',
    email: 'jo@example.com',
    role: 'admin',
    disabled_at: '2026-09-27T00:00:00Z',
    signed_in: true,
  },
];
const LINK = 'https://connect.example/auth/confirm?token_hash=abc&type=invite';
const view = (google = false) => render(<AdminsView accounts={ACCOUNTS} error={false} selfId={SELF} google={google} />);
const row = (name: RegExp) => screen.getByRole('row', { name });
const status = () => screen.getByText((_, el) => el?.className.includes('imageStatus') ?? false);

beforeEach(() => {
  vi.clearAllMocks();
  fake.create.mockResolvedValue({ ok: true, data: { name: 'Pat Kim', email: 'pat@example.com', link: LINK } });
  fake.link.mockResolvedValue({ ok: true, data: { name: 'Sam Lee', email: 'sam@example.com', link: LINK } });
  fake.role.mockResolvedValue({ ok: true, data: undefined });
  fake.disable.mockResolvedValue({ ok: true, data: undefined });
});

describe('Admins screen (A-09)', () => {
  it('lists each account with email, role, status and whether they have signed in', () => {
    view();
    expect(within(row(/Aroha Super \(you\)/)).getByText('Superadmin')).toBeInTheDocument();
    expect(within(row(/Aroha Super/)).getByRole('link', { name: 'Change password' })).toHaveAttribute(
      'href',
      '/admin/password',
    );
    expect(within(row(/Aroha Super/)).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(row(/Sam Lee/)).getByRole('combobox', { name: 'Role for Sam Lee' })).toHaveValue('admin');
    expect(within(row(/Sam Lee/)).getByText('Not signed in yet')).toBeInTheDocument();
    expect(within(row(/Jo Brown/)).getByText('Disabled')).toBeInTheDocument();
    expect(within(row(/Jo Brown/)).queryByRole('button', { name: /New set-up link/ })).not.toBeInTheDocument();
    expect(within(row(/Jo Brown/)).getByRole('button', { name: 'Enable Jo Brown' })).toBeInTheDocument();
  });

  it('creates an account and shows its set-up link, focused, to copy and send; Done goes back to the form', async () => {
    const user = userEvent.setup();
    view(true);
    await user.type(screen.getByLabelText('Name'), 'Pat Kim');
    await user.type(screen.getByLabelText('Email'), 'pat@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'superadmin');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(fake.create).toHaveBeenCalledWith({ name: 'Pat Kim', email: 'pat@example.com', role: 'superadmin' });
    const heading = await screen.findByRole('heading', { name: 'Set-up link for Pat Kim' });
    expect(heading).toHaveFocus();
    expect(screen.getByLabelText('Set-up link')).toHaveValue(LINK);
    expect(
      screen.getByText(/It works once and expires in 1 hour\. They can also sign in with Google as pat@example\.com\./),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(screen.getByText('Link copied.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Set-up link')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('shows why an account was not created, and a lost connection', async () => {
    const user = userEvent.setup();
    view();
    fake.create.mockResolvedValueOnce({ ok: false, error: 'Enter a valid email address.' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter a valid email address.')).toHaveAttribute('role', 'alert');
    fake.create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Could not reach the server. Check your connection.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Set-up link')).not.toBeInTheDocument();
  });

  it('makes a fresh link for an account, and focus returns to that button on Done', async () => {
    const user = userEvent.setup();
    view();
    const button = within(row(/Sam Lee/)).getByRole('button', { name: 'New set-up link for Sam Lee' });
    await user.click(button);
    expect(fake.link).toHaveBeenCalledWith(SAM);
    expect(await screen.findByRole('heading', { name: 'Set-up link for Sam Lee' })).toHaveFocus();
    expect(screen.getByText(/expires in 1 hour\.$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(button).toHaveFocus();
    fake.link.mockResolvedValueOnce({ ok: false, error: 'Enable the account before making a set-up link.' });
    await user.click(button);
    expect(status()).toHaveTextContent('Enable the account before making a set-up link.');
  });

  it('asks before changing a role: Cancel keeps it, Change role saves it, a refusal puts it back', async () => {
    const user = userEvent.setup();
    view();
    const select = within(row(/Sam Lee/)).getByRole('combobox', { name: 'Role for Sam Lee' });
    await user.selectOptions(select, 'superadmin');
    const dialog = screen.getByRole('dialog', { name: 'Make Sam Lee a superadmin?' });
    expect(dialog).toHaveTextContent(
      'Superadmins can open and change every event, the platform settings and every account.',
    );
    expect(fake.role).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(select).toHaveValue('admin');
    expect(fake.role).not.toHaveBeenCalled();

    fake.role.mockResolvedValueOnce({ ok: false, error: 'Could not change the role. Please try again.' });
    await user.selectOptions(select, 'superadmin');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change role' }));
    expect(status()).toHaveTextContent('Could not change the role. Please try again.');
    expect(status()).toHaveAttribute('data-tone', 'error');
    // The list shows what is stored, not the refused choice.
    expect(select).toHaveValue('admin');

    await user.selectOptions(select, 'superadmin');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change role' }));
    expect(fake.role).toHaveBeenLastCalledWith({ userId: SAM, role: 'superadmin' });
    expect(status()).toHaveTextContent('Sam Lee is now a superadmin.');
  });

  it('ties the new account error to its fields', async () => {
    const user = userEvent.setup();
    view();
    fake.create.mockResolvedValueOnce({ ok: false, error: 'Enter a valid email address.' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('asks before disabling, does nothing on Cancel, and enables without asking', async () => {
    const user = userEvent.setup();
    view();
    await user.click(within(row(/Sam Lee/)).getByRole('button', { name: 'Disable Sam Lee' }));
    const dialog = screen.getByRole('dialog', { name: 'Disable Sam Lee?' });
    expect(dialog).toHaveTextContent('Their events stay as they are.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fake.disable).not.toHaveBeenCalled();
    await user.click(within(row(/Sam Lee/)).getByRole('button', { name: 'Disable Sam Lee' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable account' }));
    expect(fake.disable).toHaveBeenCalledWith({ userId: SAM, disabled: true });
    expect(status()).toHaveTextContent('Sam Lee is disabled.');
    await user.click(within(row(/Jo Brown/)).getByRole('button', { name: 'Enable Jo Brown' }));
    expect(fake.disable).toHaveBeenLastCalledWith({ userId: JO, disabled: false });
    expect(status()).toHaveTextContent('Jo Brown is enabled.');
  });

  it('says when the accounts could not be loaded', () => {
    render(<AdminsView accounts={[]} error selfId={SELF} google={false} />);
    expect(screen.getByText('Could not load accounts. Please refresh the page.')).toHaveAttribute('role', 'alert');
  });
});
