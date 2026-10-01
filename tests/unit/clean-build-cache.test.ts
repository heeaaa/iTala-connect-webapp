import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanBuildCache, TURBOPACK_BUILD_CACHES } from '../../scripts/clean-build-cache';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clean-build-cache-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('production compiler cache cleanup', () => {
  it('removes restored compiler caches and preserves neighbouring build files', () => {
    for (const cache of TURBOPACK_BUILD_CACHES) {
      mkdirSync(join(dir, cache, 'old-version'), { recursive: true });
      writeFileSync(join(dir, cache, 'old-version', 'environment.sst'), 'old build environment');
    }
    mkdirSync(join(dir, '.next', 'cache', 'images'), { recursive: true });
    writeFileSync(join(dir, '.next', 'cache', 'images', 'keep'), 'image cache');
    writeFileSync(join(dir, 'keep'), 'source');

    cleanBuildCache(dir);

    for (const cache of TURBOPACK_BUILD_CACHES) expect(existsSync(join(dir, cache))).toBe(false);
    expect(readFileSync(join(dir, '.next', 'cache', 'images', 'keep'), 'utf8')).toBe('image cache');
    expect(readFileSync(join(dir, 'keep'), 'utf8')).toBe('source');
  });

  it('handles fresh and repeated builds without requiring existing cache directories', () => {
    expect(() => cleanBuildCache(dir)).not.toThrow();
    expect(() => cleanBuildCache(dir)).not.toThrow();
  });

  it('refuses to follow a cache ancestor junction into another directory', () => {
    const outside = join(dir, 'other-workspace');
    mkdirSync(join(outside, 'cache', 'turbopack'), { recursive: true });
    const sentinel = join(outside, 'cache', 'turbopack', 'keep');
    writeFileSync(sentinel, 'other workspace');
    symlinkSync(outside, join(dir, '.next'), 'junction');

    expect(() => cleanBuildCache(dir)).toThrow('through a symlink');
    expect(readFileSync(sentinel, 'utf8')).toBe('other workspace');
    rmSync(join(dir, '.next'));
  });
});
