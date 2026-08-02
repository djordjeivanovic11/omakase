import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

/**
 * pnpm's hoisted node-linker installs every dependency into the workspace root
 * `node_modules`, so `apps/desktop/node_modules` is nearly empty and
 * @electron/packager has nothing to bundle. Vite already inlines the pure-JS
 * dependencies into the main bundle; only the modules kept external (native
 * addons and their transitive dependencies) have to exist on disk at runtime.
 *
 * This copies exactly those trees into the packaged app.
 */

function findPackageDir(name, searchRoots) {
  for (const root of searchRoots) {
    const candidate = path.join(root, ...name.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

/** Keep optional native packages for this host; drop every other platform. */
function isRelevantOptionalDep(name, platform, arch) {
  const lower = name.toLowerCase();
  const platformTokens = {
    darwin: ['darwin', 'osx', 'mac'],
    linux: ['linux', 'linuxmusl'],
    win32: ['win32', 'windows'],
  };
  const archTokens = {
    arm64: ['arm64', 'aarch64'],
    x64: ['x64', 'x86_64', 'amd64'],
    ia32: ['ia32', 'x86'],
  };

  const mentionsPlatform = Object.values(platformTokens)
    .flat()
    .some((token) => lower.includes(token));
  const mentionsArch = Object.values(archTokens)
    .flat()
    .some((token) => lower.includes(token));

  if (mentionsPlatform) {
    const allowed = platformTokens[platform] ?? [platform];
    if (!allowed.some((token) => lower.includes(token))) return false;
  }
  if (mentionsArch) {
    const allowed = archTokens[arch] ?? [arch];
    if (!allowed.some((token) => lower.includes(token))) return false;
  }
  // wasm32 is a portable fallback for sharp; keep it only when no native match exists.
  if (lower.includes('wasm32')) return false;
  return true;
}

function collectTransitive(names, searchRoots, platform, arch) {
  const resolved = new Map();
  const queue = [...names];

  while (queue.length > 0) {
    const name = queue.shift();
    if (resolved.has(name)) continue;

    const dir = findPackageDir(name, searchRoots);
    if (!dir) {
      // Optional peers frequently resolve to nothing; that is not fatal.
      continue;
    }
    resolved.set(name, dir);

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (!resolved.has(dep)) queue.push(dep);
    }
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
      if (!isRelevantOptionalDep(dep, platform, arch)) continue;
      if (!resolved.has(dep)) queue.push(dep);
    }
  }

  return resolved;
}

export function copyRuntimeDeps({
  externals,
  searchRoots,
  destNodeModules,
  platform = process.platform,
  arch = process.arch,
}) {
  const resolved = collectTransitive(externals, searchRoots, platform, arch);
  fs.mkdirSync(destNodeModules, { recursive: true });

  const copied = [];
  for (const [name, dir] of resolved) {
    const dest = path.join(destNodeModules, ...name.split('/'));
    if (fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(dir, dest, {
      recursive: true,
      dereference: true,
      filter: (src) => {
        const base = path.basename(src);
        // Build scaffolding and sources are dead weight inside the app bundle.
        return base !== '.bin' && base !== 'obj.target' && base !== '.github';
      },
    });
    copied.push(name);
  }

  const missing = externals.filter((name) => !resolved.has(name));
  return { copied, missing, resolvedNames: [...resolved.keys()] };
}

const BUILTINS = new Set(builtinModules);

/**
 * A module that Rollup left as a bare `require` but that nobody copied into the
 * bundle makes the packaged app die at load time with no visible error. Catch
 * that at package time instead.
 */
export function findUnshippedRequires(buildDir, shippedNames) {
  const shipped = new Set([...shippedNames, 'electron']);
  const required = new Set();

  for (const entry of fs.readdirSync(buildDir)) {
    if (!entry.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(buildDir, entry), 'utf8');
    for (const match of source.matchAll(/require\(\s*["']([^"')]+)["']\s*\)/g)) {
      const name = match[1];
      if (name.startsWith('.') || name.startsWith('/') || name.startsWith('node:')) continue;
      if (BUILTINS.has(name)) continue;
      const packageName = name.startsWith('@')
        ? name.split('/').slice(0, 2).join('/')
        : name.split('/')[0];
      if (!shipped.has(packageName)) required.add(packageName);
    }
  }

  return [...required].sort();
}
