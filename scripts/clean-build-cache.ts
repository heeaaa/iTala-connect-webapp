import { lstatSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// Netlify can restore either location before invoking the build command.
// Keep image/font caches and other build output; only the compiler cache contains
// the build environment and is disabled in next.config.ts.
export const TURBOPACK_BUILD_CACHES = ['.next/cache/turbopack', '.netlify/.next/cache/turbopack'] as const;

export function cleanBuildCache(projectRoot: string): void {
  const root = resolve(projectRoot);
  for (const cache of TURBOPACK_BUILD_CACHES) {
    const target = resolve(root, cache);
    const withinRoot = relative(root, target);
    if (!withinRoot || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) {
      throw new Error('Refusing to remove a compiler cache outside the project');
    }

    // Never follow a junction/symlink into another workspace when removing a cache.
    let ancestor = root;
    for (const part of withinRoot.split(sep)) {
      ancestor = join(ancestor, part);
      try {
        if (lstatSync(ancestor).isSymbolicLink()) {
          throw new Error(`Refusing to remove a compiler cache through a symlink: ${cache}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    rmSync(target, { recursive: true, force: true });
  }
}

if (process.argv[1] && /clean-build-cache\.ts$/.test(process.argv[1])) {
  cleanBuildCache(process.cwd());
  console.log('Build cache cleanup passed (Turbopack only).');
}
