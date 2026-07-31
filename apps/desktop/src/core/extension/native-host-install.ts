import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const NATIVE_HOST_NAME = 'com.omakase.desktop';

const PLACEHOLDER_IDS = new Set([
  'PLACEHOLDER_CHROME_EXTENSION_ID',
  'PLACEHOLDER_EDGE_EXTENSION_ID',
]);

export interface NativeHostInstallResult {
  hostScriptPath: string;
  manifestPaths: string[];
  allowedExtensionIds: string[];
}

function allowedIdsPath(libraryRoot: string): string {
  return path.join(libraryRoot, 'native-host', 'allowed-extension-ids.json');
}

export function readAllowedExtensionIds(libraryRoot: string): string[] {
  const file = allowedIdsPath(libraryRoot);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { ids?: string[] };
    return (parsed.ids ?? []).filter((id) => typeof id === 'string' && id.length > 10);
  } catch {
    return [];
  }
}

export function saveAllowedExtensionIds(libraryRoot: string, ids: string[]): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const dir = path.dirname(allowedIdsPath(libraryRoot));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(allowedIdsPath(libraryRoot), JSON.stringify({ ids: unique }, null, 2));
  return unique;
}

export function addAllowedExtensionId(libraryRoot: string, extensionId: string): string[] {
  const cleaned = extensionId.trim();
  if (!/^[a-p]{32}$/.test(cleaned)) {
    throw new Error('Extension ID must be the 32-character id shown on chrome://extensions.');
  }
  return saveAllowedExtensionIds(libraryRoot, [...readAllowedExtensionIds(libraryRoot), cleaned]);
}

function chromeNativeMessagingDirs(): string[] {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return [
      path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
      path.join(home, 'Library/Application Support/Chromium/NativeMessagingHosts'),
      path.join(home, 'Library/Application Support/Microsoft Edge/NativeMessagingHosts'),
      path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts'),
    ];
  }
  if (process.platform === 'linux') {
    return [
      path.join(home, '.config/google-chrome/NativeMessagingHosts'),
      path.join(home, '.config/chromium/NativeMessagingHosts'),
      path.join(home, '.config/microsoft-edge/NativeMessagingHosts'),
    ];
  }
  return [];
}

function resolveBundledHostScript(resourcesPath: string): string | null {
  const candidates = [
    path.join(resourcesPath, 'native-host', 'omakase_native_host.py'),
    path.join(resourcesPath, 'resources', 'native-host', 'omakase_native_host.py'),
    // Development: apps/desktop/resources/...
    path.resolve(__dirname, '../../resources/native-host/omakase_native_host.py'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Installs the Python stdio host and Chrome/Edge native messaging manifests
 * for every registered extension ID. Safe to call on every app launch.
 */
export function installNativeMessagingHost(options: {
  libraryRoot: string;
  resourcesPath: string;
  extraExtensionIds?: string[];
}): NativeHostInstallResult {
  const bundled = resolveBundledHostScript(options.resourcesPath);
  if (!bundled) {
    throw new Error('Bundled native messaging host script is missing from resources.');
  }

  const installDir = path.join(options.libraryRoot, 'native-host');
  fs.mkdirSync(installDir, { recursive: true });
  const hostScriptPath = path.join(installDir, 'omakase_native_host.py');
  fs.copyFileSync(bundled, hostScriptPath);
  fs.chmodSync(hostScriptPath, 0o755);

  // Wrapper so Chrome launches python3 without depending on a shebang path.
  const launcherPath = path.join(installDir, 'omakase-native-host');
  const launcher = `#!/bin/bash\nexec /usr/bin/env python3 "${hostScriptPath}" "$@"\n`;
  fs.writeFileSync(launcherPath, launcher, { mode: 0o755 });
  fs.chmodSync(launcherPath, 0o755);

  const allowed = [
    ...readAllowedExtensionIds(options.libraryRoot),
    ...(options.extraExtensionIds ?? []),
  ].filter((id) => !PLACEHOLDER_IDS.has(id));

  const origins = allowed.map((id) => `chrome-extension://${id}/`);
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Omakase local learning studio',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: origins.length > 0 ? origins : ['chrome-extension://invalidpendingregister/'],
  };

  const manifestPaths: string[] = [];
  for (const dir of chromeNativeMessagingDirs()) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const manifestPath = path.join(dir, `${NATIVE_HOST_NAME}.json`);
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      manifestPaths.push(manifestPath);
    } catch {
      // Browser may not be installed; skip that path.
    }
  }

  return { hostScriptPath: launcherPath, manifestPaths, allowedExtensionIds: allowed };
}
