import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
// Plain JS packaging helpers (kept as .mjs for Forge/Vite runtime import).
// @ts-expect-error -- no types for packaging helper
import { NATIVE_EXTERNALS } from './native-externals.mjs';
// @ts-expect-error -- no types for packaging helper
import { copyRuntimeDeps, findUnshippedRequires } from './scripts/copy-runtime-deps.mjs';

const signIdentity = process.env.OMAKASE_CODESIGN_IDENTITY;
const EMBEDDING_MODEL_ID = 'granite-embedding-107m-multilingual';

const config = {
  packagerConfig: {
    // Native addons and the shared libraries they link against must both sit
    // outside the archive. Brace globs are unreliable across packager versions,
    // so unpack the whole native package trees.
    asar: {
      unpack: '**/*.{node,dylib,so,dll}',
      unpackDir:
        '{**/node_modules/better-sqlite3,**/node_modules/onnxruntime-node,**/node_modules/sharp,**/node_modules/@img}',
    },
    name: 'Omakase',
    executableName: 'Omakase',
    appBundleId: 'app.omakase.desktop',
    appCategoryType: 'public.app-category.education',
    // Shipped into Contents/Resources/<basename>. The migration runner and the
    // embedding model loader resolve these through process.resourcesPath.
    extraResource: ['./resources/models', './resources/native-host', '../../migrations'],
    // Every runtime dependency is either inlined by Vite or copied in by the
    // packageAfterCopy hook below, so packager should not walk node_modules.
    prune: false,
    ignore: [
      /^\/node_modules($|\/)/,
      /^\/src($|\/)/,
      /^\/tests($|\/)/,
      /^\/scripts($|\/)/,
      /^\/out($|\/)/,
      /^\/resources($|\/)/,
      /^\/\.vite\/renderer\/.*\/\.vite($|\/)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ name: 'Omakase' }),
    // ZIP is the Forge-native macOS distributable. DMG is built with
    // `scripts/make-macos-dmg.sh` (hdiutil) — MakerDMG/appdmg native deps are brittle under pnpm.
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Asar integrity requires a real Developer ID signature on macOS; with the
      // ad-hoc signature used for local builds it prevents the app from starting.
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: Boolean(signIdentity),
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    generateAssets: async () => {
      // Semantic search is a core feature, so a release must never be built
      // without the weights it depends on.
      const modelFile = path.join(
        __dirname,
        'resources/models',
        EMBEDDING_MODEL_ID,
        'onnx/model.onnx',
      );
      if (!fs.existsSync(modelFile)) {
        throw new Error(
          `Cannot package: the embedding model is missing.\nRun "pnpm --filter @omakase/desktop fetch:model" first (expected ${modelFile}).`,
        );
      }
    },
    packageAfterCopy: async (
      _forgeConfig: unknown,
      buildPath: string,
      _electronVersion: string,
      platform: string,
      arch: string,
    ) => {
      const appDir = path.resolve(__dirname);
      const result = copyRuntimeDeps({
        externals: NATIVE_EXTERNALS,
        searchRoots: [
          path.join(appDir, 'node_modules'),
          path.resolve(appDir, '../../node_modules'),
        ],
        destNodeModules: path.join(buildPath, 'node_modules'),
        platform,
        arch,
      });
      if (result.missing.length > 0) {
        throw new Error(
          `Cannot package: runtime dependencies not found in node_modules: ${result.missing.join(', ')}`,
        );
      }

      const unshipped = findUnshippedRequires(
        path.join(buildPath, '.vite', 'build'),
        result.resolvedNames,
      );
      if (unshipped.length > 0) {
        throw new Error(
          `Cannot package: the main bundle requires modules that are not shipped: ${unshipped.join(', ')}. ` +
            'Add them to native-externals.mjs or let Vite inline them.',
        );
      }

      pruneForeignPlatformBinaries(path.join(buildPath, 'node_modules'), platform, arch);
      console.info(`[omakase] bundled ${result.copied.length} runtime dependencies`);
    },
    postPackage: async (_forgeConfig: unknown, options: { outputPaths: string[] }) => {
      for (const outputPath of options.outputPaths) {
        const appBundle = fs.readdirSync(outputPath).find((entry) => entry.endsWith('.app'));
        if (!appBundle) continue;
        const target = path.join(outputPath, appBundle);
        assertNativeLibrariesUnpacked(target, process.platform, process.arch);
        if (process.platform === 'darwin') {
          // Flipping fuses rewrites the Electron binary and invalidates the
          // bundle signature. macOS refuses to start a mismatched signature
          // and fails without any visible error, so re-sign every time.
          execFileSync('codesign', ['--force', '--deep', '--sign', signIdentity ?? '-', target]);
          execFileSync('codesign', ['--verify', '--deep', '--strict', target]);
          console.info(`[omakase] signed ${appBundle} (${signIdentity ?? 'ad-hoc'})`);
        }
      }
    },
  },
};

/**
 * Fail packaging when a native binding cannot resolve its shared library.
 * Electron can only dlopen files that sit outside the asar archive.
 */
function assertNativeLibrariesUnpacked(appBundle: string, platform: string, arch: string): void {
  const unpackedRoot = path.join(
    appBundle,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
  );
  const required = [
    path.join(unpackedRoot, 'better-sqlite3', 'prebuilds', `${platform}-${arch}.node`),
    path.join(
      unpackedRoot,
      'onnxruntime-node',
      'bin',
      'napi-v3',
      platform,
      arch,
      'onnxruntime_binding.node',
    ),
  ];
  if (platform === 'darwin') {
    required.push(
      path.join(
        unpackedRoot,
        'onnxruntime-node',
        'bin',
        'napi-v3',
        platform,
        arch,
        'libonnxruntime.1.21.0.dylib',
      ),
      path.join(unpackedRoot, '@img', `sharp-darwin-${arch}`, 'package.json'),
      path.join(unpackedRoot, '@img', `sharp-libvips-darwin-${arch}`, 'package.json'),
    );
  }
  const missing = required.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(
      `Cannot ship: native libraries were not unpacked from the asar:\n${missing.join('\n')}`,
    );
  }
}

/** onnxruntime-node ships every platform; keep only the one we are building for. */
function pruneForeignPlatformBinaries(nodeModules: string, platform: string, arch: string): void {
  const binRoot = path.join(nodeModules, 'onnxruntime-node', 'bin');
  if (!fs.existsSync(binRoot)) return;

  for (const napiDir of fs.readdirSync(binRoot)) {
    const platformRoot = path.join(binRoot, napiDir);
    if (!fs.statSync(platformRoot).isDirectory()) continue;

    for (const platformName of fs.readdirSync(platformRoot)) {
      const platformPath = path.join(platformRoot, platformName);
      if (platformName !== platform) {
        fs.rmSync(platformPath, { recursive: true, force: true });
        continue;
      }
      for (const archName of fs.readdirSync(platformPath)) {
        if (archName !== arch) {
          fs.rmSync(path.join(platformPath, archName), { recursive: true, force: true });
        }
      }
    }
  }
}

export default config;
