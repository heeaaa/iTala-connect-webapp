import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ path: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));

const { PlatformFrame, StatusBug, TitlePlate } = await import('@/components/platform/platform-frame');
const { sectionOf } = await import('@/components/platform/platform-nav');

function frame(props: Partial<Parameters<typeof PlatformFrame>[0]> = {}) {
  return render(
    <PlatformFrame
      current="events"
      viewer={null}
      fontClassName="f"
      signOut={<button type="submit">Sign out</button>}
      {...props}
    >
      <p>content</p>
    </PlatformFrame>,
  );
}

describe('PlatformFrame network bar (PRD N-01)', () => {
  it('shows the public bar: home link, Events, Sign in', () => {
    nav.path = '/';
    frame();
    expect(screen.getByRole('link', { name: 'iTala Connect home' })).toHaveAttribute('href', '/');
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(main)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Events']);
    expect(within(main).getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByTestId('signed-in-as')).not.toBeInTheDocument();
  });

  it('hides its own Sign in link on the sign-in page', () => {
    frame({ current: 'login' });
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('gives an admin Dashboard but no superadmin links', () => {
    nav.path = '/admin';
    frame({ current: 'admin', viewer: { name: 'Aroha', role: 'admin' } });
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(main)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Events', 'Dashboard']);
    expect(within(main).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('signed-in-as')).toHaveTextContent('Aroha (Admin)');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('gives a superadmin Settings and Admins, marking the current one', () => {
    nav.path = '/admin/admins';
    frame({ current: 'admin', viewer: { name: 'Sam', role: 'superadmin' } });
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(main)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Events', 'Dashboard', 'Settings', 'Admins']);
    expect(within(main).getByRole('link', { name: 'Admins' })).toHaveAttribute('aria-current', 'page');
    expect(within(main).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('signed-in-as')).toHaveTextContent('Sam (Superadmin)');
  });
});

describe('platform pieces', () => {
  it('maps paths to sections', () => {
    expect(sectionOf('/')).toBe('events');
    expect(sectionOf('/admin')).toBe('dashboard');
    expect(sectionOf('/admin/events/1')).toBe('dashboard');
    expect(sectionOf('/admin/settings')).toBe('settings');
    expect(sectionOf('/admin/admins')).toBe('admins');
    expect(sectionOf('/login')).toBeNull();
    expect(sectionOf('/events/x')).toBeNull();
  });

  it('title plates are real headings with an optional strapline', () => {
    const { rerender } = render(<TitlePlate id="t" title="My events" sub="Events you run" />);
    expect(screen.getByRole('heading', { level: 1, name: 'My events' })).toHaveAttribute('id', 't');
    expect(screen.getByText('Events you run')).toBeInTheDocument();
    rerender(<TitlePlate title="Admins" />);
    expect(screen.queryByText('Events you run')).not.toBeInTheDocument();
  });

  it('status bugs name the state in words; only On now carries the live pip', () => {
    const { container, rerender } = render(<StatusBug when="current" />);
    expect(screen.getByText('On now')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    for (const [when, words] of [
      ['upcoming', 'Upcoming'],
      ['past', 'Finished'],
      ['undated', 'Dates TBC'],
    ] as const) {
      rerender(<StatusBug when={when} />);
      expect(screen.getByText(words)).toBeInTheDocument();
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    }
  });
});
