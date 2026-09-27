import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no layout, so it ships no ResizeObserver; dnd-kit (the schedule's
// drag and drop) creates one when it loads. There is nothing to observe here,
// so a no-op stands in. Real dragging is proven in Chromium (Playwright).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => cleanup());
