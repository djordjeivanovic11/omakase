import fs from 'node:fs';
import path from 'node:path';

export interface AppPaths {
  root: string;
  dbPath: string;
  assetsDir: string;
  derivedDir: string;
  secretsDir: string;
  logsDir: string;
  tmpDir: string;
  backupsDir: string;
  modelsDir: string;
}

/**
 * Packaged builds ship the embedding model as an extra resource. During
 * development `process.resourcesPath` points inside the stock Electron bundle,
 * so the repository copy is used instead.
 */
function resolveModelsDir(root: string, resourcesPath?: string): string {
  const candidates = [
    resourcesPath ? path.join(resourcesPath, 'models') : null,
    path.resolve(process.cwd(), 'resources/models'),
    path.resolve(process.cwd(), 'apps/desktop/resources/models'),
  ].filter((candidate): candidate is string => candidate !== null);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'manifest.json'))) return candidate;
  }
  return candidates[0] ?? path.join(root, 'models');
}

export function resolveAppPaths(userDataPath: string, resourcesPath?: string): AppPaths {
  const root = path.join(userDataPath, 'omakase');
  const paths: AppPaths = {
    root,
    dbPath: path.join(root, 'library.sqlite'),
    assetsDir: path.join(root, 'assets'),
    derivedDir: path.join(root, 'derived'),
    secretsDir: path.join(root, 'secrets'),
    logsDir: path.join(root, 'logs'),
    tmpDir: path.join(root, 'tmp'),
    backupsDir: path.join(root, 'backups'),
    modelsDir: resolveModelsDir(root, resourcesPath),
  };
  for (const dir of [
    paths.root,
    paths.assetsDir,
    paths.derivedDir,
    paths.secretsDir,
    paths.logsDir,
    paths.tmpDir,
    paths.backupsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
