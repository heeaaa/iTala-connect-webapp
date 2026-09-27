import { beforeAll, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayersDialog } from '@/app/admin/_components/players-dialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

it('bulk adds parsed players to an existing team and keeps existing rows editable', async () => {
  const user = userEvent.setup();
  const onDone = vi.fn();
  render(
    <PlayersDialog
      team={{
        id: crypto.randomUUID(),
        name: 'Kea',
        coach: '',
        players: [{ id: crypto.randomUUID(), name: 'Existing player', number: '4' }],
      }}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  );

  await user.type(screen.getByRole('textbox', { name: 'Paste players' }), 'Ana Lim #07{enter}#11 Juan Dela Cruz');
  await user.click(screen.getByRole('button', { name: 'Add pasted players' }));
  expect(screen.getByDisplayValue('Existing player')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Ana Lim')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Juan Dela Cruz')).toBeInTheDocument();
  expect(screen.getByDisplayValue('07')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(onDone).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Existing player', number: '4' }),
      expect.objectContaining({ name: 'Ana Lim', number: '07' }),
      expect.objectContaining({ name: 'Juan Dela Cruz', number: '11' }),
    ]),
  );
});

it('shows ambiguous pasted lines for review and keeps them unsaved on Cancel', async () => {
  const user = userEvent.setup();
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <PlayersDialog
      team={{ id: crypto.randomUUID(), name: 'Kea', coach: '', players: [] }}
      onDone={onDone}
      onCancel={onCancel}
    />,
  );
  await user.type(screen.getByRole('textbox', { name: 'Paste players' }), 'Ana Lim #7{enter}Jun');
  await user.click(screen.getByRole('button', { name: 'Add pasted players' }));
  expect(screen.getByDisplayValue('Jun')).toBeInTheDocument();
  expect(screen.getByText(/Possible stray line/)).toBeInTheDocument();
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(onDone).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledOnce();
});
