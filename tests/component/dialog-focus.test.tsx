import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmDialog } from '@/app/admin/_components/confirm-dialog';
import { PlayersDialog } from '@/app/admin/_components/players-dialog';

// jsdom's dialog stubs (like a dialog removed from the page while open in a
// real browser) never hand focus back, so this proves the dialogs do it.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function Opener({ dialog }: { dialog: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      {open && dialog(() => setOpen(false))}
    </>
  );
}

describe('closing a dialog gives focus back to the button that opened it (WCAG 2.4.3)', () => {
  it('the confirmation dialog', async () => {
    const user = userEvent.setup();
    render(
      <Opener
        dialog={(close) => (
          <ConfirmDialog
            title="Remove Hawks?"
            message="Sure?"
            confirmLabel="Continue"
            onConfirm={close}
            onCancel={close}
          />
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    // The safe choice takes focus inside the dialog.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Open it' })).toHaveFocus();
  });

  it('the players dialog', async () => {
    const user = userEvent.setup();
    render(
      <Opener
        dialog={(close) => (
          <PlayersDialog
            team={{ id: 't', name: 'Hawks', coach: '', players: [{ id: 'p', name: 'Bea', number: '4' }] }}
            onCancel={close}
            onDone={close}
          />
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByDisplayValue('Bea')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Open it' })).toHaveFocus();
  });
});

describe('when the confirmed action removes the button that opened it', () => {
  function Teams() {
    const [teams, setTeams] = useState(['Hawks', 'Owls']);
    const [asking, setAsking] = useState<string | null>(null);
    return (
      <section aria-label="Division">
        <input aria-label="Division name" defaultValue="Open" />
        {teams.map((t) => (
          <div key={t}>
            <button type="button" onClick={() => setAsking(t)}>
              Remove {t}
            </button>
          </div>
        ))}
        {asking && (
          <ConfirmDialog
            title={`Remove ${asking}?`}
            message="Sure?"
            confirmLabel="Continue"
            onCancel={() => setAsking(null)}
            onConfirm={() => {
              setTeams((v) => v.filter((t) => t !== asking));
              setAsking(null);
            }}
          />
        )}
      </section>
    );
  }

  it('focus goes to the first control of the nearest part of the page still there', async () => {
    const user = userEvent.setup();
    render(<Teams />);
    await user.click(screen.getByRole('button', { name: 'Remove Hawks' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('button', { name: 'Remove Hawks' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Division name')).toHaveFocus();
  });
});
