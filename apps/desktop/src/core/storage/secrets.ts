import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex } from './hash.js';

export interface SecretStore {
  setSecret(ref: string, plaintext: string): void;
  getSecret(ref: string): string | null;
  deleteSecret(ref: string): void;
  hasSecret(ref: string): boolean;
}

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * OS-backed secret storage. Keys never enter SQLite or the renderer.
 * When Electron safeStorage is unavailable (e.g. headless tests), a
 * test-only file encryptor may be injected — never plaintext on disk
 * in production paths.
 */
export class FileSecretStore implements SecretStore {
  constructor(
    private readonly secretsDir: string,
    private readonly safeStorage: SafeStorageLike,
  ) {
    fs.mkdirSync(secretsDir, { recursive: true });
  }

  private fileFor(ref: string): string {
    const safe = sha256Hex(ref).slice(0, 32);
    return path.join(this.secretsDir, `${safe}.bin`);
  }

  setSecret(ref: string, plaintext: string): void {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS-backed encryption is unavailable. Provider keys cannot be stored in plaintext.',
      );
    }
    const encrypted = this.withKeychainLogging('store', () =>
      this.safeStorage.encryptString(plaintext),
    );
    fs.writeFileSync(this.fileFor(ref), encrypted);
  }

  getSecret(ref: string): string | null {
    const file = this.fileFor(ref);
    if (!fs.existsSync(file)) return null;
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('OS-backed encryption is unavailable; cannot decrypt secrets.');
    }
    const buf = fs.readFileSync(file);
    return this.withKeychainLogging('read', () => this.safeStorage.decryptString(buf));
  }

  /**
   * macOS blocks on a keychain authorisation prompt, which is indistinguishable
   * from a hang unless it is recorded. Never logs the secret itself.
   */
  private withKeychainLogging<T>(operation: 'store' | 'read', fn: () => T): T {
    const started = Date.now();
    try {
      return fn();
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed > 1000) {
        this.onSlowKeychainAccess?.(operation, elapsed);
      }
    }
  }

  onSlowKeychainAccess?: (operation: 'store' | 'read', elapsedMs: number) => void;

  deleteSecret(ref: string): void {
    const file = this.fileFor(ref);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  hasSecret(ref: string): boolean {
    return fs.existsSync(this.fileFor(ref));
  }
}

/** Deterministic XOR "encryption" for automated tests only. */
export class TestSafeStorage implements SafeStorageLike {
  isEncryptionAvailable(): boolean {
    return true;
  }

  encryptString(plain: string): Buffer {
    const key = Buffer.from('omakase-test-secret-key!!');
    const input = Buffer.from(plain, 'utf8');
    const out = Buffer.alloc(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = input[i]! ^ key[i % key.length]!;
    }
    return out;
  }

  decryptString(encrypted: Buffer): string {
    return this.encryptString(encrypted.toString('binary')).toString('utf8');
  }
}

export function maskKeySuffix(apiKey: string): string {
  if (apiKey.length <= 4) return '••••';
  return `••••${apiKey.slice(-4)}`;
}
