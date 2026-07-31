import { app, safeStorage } from 'electron';
import { AgentService } from '../core/agent/agent-service.js';
import { JobQueue } from '../core/jobs/queue.js';
import { LearningMapService } from '../core/learning/learning-map.js';
import { NextActionsService } from '../core/learning/next-actions.js';
import { ProbeMachine } from '../core/learning/probe-machine.js';
import { ProviderRepo } from '../core/providers/provider-repo.js';
import { UsageService } from '../core/providers/usage.js';
import { getLogger } from '../core/observability/logger.js';
import {
  type EmbeddingService,
  EmbeddingsRepo,
  HashEmbeddingService,
  LocalEmbeddingService,
} from '../core/retrieval/embeddings.js';
import { SourcesRepo } from '../core/sources/sources-repo.js';
import { AssetStore } from '../core/storage/asset-store.js';
import type { DatabaseHandle } from '../core/storage/database.js';
import { openDatabase } from '../core/storage/database.js';
import { type AppPaths, resolveAppPaths } from '../core/storage/paths.js';
import {
  FileSecretStore,
  type SafeStorageLike,
  type SecretStore,
  TestSafeStorage,
} from '../core/storage/secrets.js';
import { StudiosRepo } from '../core/storage/studios-repo.js';

export interface AppContext {
  paths: AppPaths;
  db: DatabaseHandle;
  secretStore: SecretStore;
  studios: StudiosRepo;
  sources: SourcesRepo;
  assets: AssetStore;
  jobs: JobQueue;
  providers: ProviderRepo;
  agent: AgentService;
  probe: ProbeMachine;
  usage: UsageService;
  nextActions: NextActionsService;
  learningMap: LearningMapService;
  embeddingService: EmbeddingService;
  embeddingsRepo: EmbeddingsRepo;
  close(): void;
}

/**
 * Tests use hash embeddings so they stay fast and offline. Everything else uses
 * the bundled model, and a missing model is surfaced rather than papered over
 * with meaningless vectors that would quietly ruin search results.
 */
function createEmbeddingService(modelsDir: string): EmbeddingService {
  if (process.env.OMAKASE_TEST === '1' || process.env.OMAKASE_HASH_EMBEDDINGS === '1') {
    return new HashEmbeddingService();
  }

  const local = new LocalEmbeddingService({ modelsDir });
  if (!local.isAvailable()) {
    getLogger().warn('Bundled embedding model missing; semantic search is disabled', { modelsDir });
    return new HashEmbeddingService();
  }
  return local;
}

function createSafeStorage(): SafeStorageLike {
  if (process.env.OMAKASE_TEST === '1') {
    return new TestSafeStorage();
  }
  return safeStorage;
}

export function createAppContext(): AppContext {
  const paths = resolveAppPaths(app.getPath('userData'), process.resourcesPath);
  const db = openDatabase(paths.dbPath);
  const safeStorage = createSafeStorage();
  const secretStore = new FileSecretStore(paths.secretsDir, safeStorage);
  secretStore.onSlowKeychainAccess = (operation, elapsedMs) => {
    getLogger().warn('Keychain access was slow; a system prompt was probably shown', {
      operation,
      elapsedMs,
    });
  };

  const studios = new StudiosRepo(db.db);
  const sources = new SourcesRepo(db.db);
  const assets = new AssetStore(db.db, paths.assetsDir);
  const jobs = new JobQueue(db.db);
  const providers = new ProviderRepo(db.db, secretStore);
  const usage = new UsageService(db.db, providers);
  const embeddingService = createEmbeddingService(paths.modelsDir);
  const embeddingsRepo = new EmbeddingsRepo(db.db, embeddingService);
  const nextActions = new NextActionsService(db.db);
  const learningMap = new LearningMapService(db.db, nextActions);
  const agent = new AgentService({ db: db.db, secretStore, embeddingService });
  const probe = new ProbeMachine(db.db, secretStore, embeddingService, providers, usage);

  return {
    paths,
    db,
    secretStore,
    studios,
    sources,
    assets,
    jobs,
    providers,
    agent,
    probe,
    usage,
    nextActions,
    learningMap,
    embeddingService,
    embeddingsRepo,
    close() {
      db.close();
    },
  };
}
