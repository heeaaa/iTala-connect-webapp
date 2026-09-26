import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayersDialog } from '@/app/admin/_components/players-dialog';
import { DatePicker } from '@/app/admin/_components/date-picker';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
describe('Draft editing', () => {
  it('keeps typed roster fields while adding and removing rows', async () => {
    const done = vi.fn();
    const user = userEvent.setup();
    render(
      <PlayersDialog
        team={{
          id: 't',
          name: 'Hawks',
          coach: '',
          players: [
            { id: 'p1', name: 'Ari', number: '04' },
            { id: 'p2', name: 'Bea', number: '7' },
          ],
        }}
        onDone={done}
        onCancel={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText('Player 1'));
    await user.type(screen.getByLabelText('Player 1'), 'Ari Edited');
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    await user.type(screen.getByLabelText('Player 3'), 'New Player');
    await user.click(screen.getByRole('button', { name: 'Remove player 2' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(done).toHaveBeenCalledWith([
      { id: 'p1', name: 'Ari Edited', number: '04' },
      { id: expect.any(String), name: 'New Player', number: '' },
    ]);
  });
  it('allows keyboard date movement and toggles the selected date', async () => {
    const change = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker value={['2026-09-01']} onChange={change} />);
    const one = screen.getByRole('button', { name: '01/09/2026' });
    one.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: '02/09/2026' })).toHaveFocus();
    await user.keyboard(' ');
    expect(change).toHaveBeenCalledWith(['2026-09-01', '2026-09-02']);
    await user.click(screen.getByRole('button', { name: 'Remove 01/09/2026' }));
    expect(change).toHaveBeenLastCalledWith([]);
  });
});
