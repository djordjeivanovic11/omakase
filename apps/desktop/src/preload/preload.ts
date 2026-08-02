import {
  type AgentStreamEvent,
  AgentStreamEventSchema,
  AnswerProbeInputSchema,
  AssignSourceToStudioInputSchema,
  CollectionMembershipInputSchema,
  CreateCollectionInputSchema,
  CreateProviderProfileInputSchema,
  CreateStudioInputSchema,
  ImportPdfSourceInputSchema,
  ImportTextSourceInputSchema,
  ImportTranscriptSourceInputSchema,
  ImportUrlSourceInputSchema,
  IpcChannels,
  ListAgentActivityInputSchema,
  SendAgentMessageInputSchema,
  StartLearnSessionInputSchema,
  StartProbeInputSchema,
  UpdateCollectionInputSchema,
  UpdateStudioInputSchema,
  UuidV7Schema,
} from '@omakase/contracts';
import { contextBridge, ipcRenderer } from 'electron';

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  getAppInfo: () => invoke(IpcChannels.appGetInfo),
  getOnboardingState: () => invoke(IpcChannels.appGetOnboardingState),
  completeOnboarding: () => invoke(IpcChannels.appCompleteOnboarding),

  listProviders: () => invoke(IpcChannels.providersList),
  createProvider: (input: unknown) =>
    invoke(IpcChannels.providersCreate, CreateProviderProfileInputSchema.parse(input)),
  testProvider: (profileId: string, modelId?: string) =>
    invoke(IpcChannels.providersTest, { profileId: UuidV7Schema.parse(profileId), modelId }),
  setDefaultModel: (profileId: string, modelId: string) =>
    invoke(IpcChannels.providersSetDefaultModel, {
      profileId: UuidV7Schema.parse(profileId),
      modelId: modelId.trim(),
    }),
  deleteProvider: (profileId: string) =>
    invoke(IpcChannels.providersDelete, UuidV7Schema.parse(profileId)),
  listProviderModels: (profileId: string) =>
    invoke(IpcChannels.providersListModels, UuidV7Schema.parse(profileId)),

  listStudios: () => invoke(IpcChannels.studiosList),
  getStudio: (id: string) => invoke(IpcChannels.studiosGet, UuidV7Schema.parse(id)),
  createStudio: (input: unknown) =>
    invoke(IpcChannels.studiosCreate, CreateStudioInputSchema.parse(input)),
  updateStudio: (input: unknown) =>
    invoke(IpcChannels.studiosUpdate, UpdateStudioInputSchema.parse(input)),
  deleteStudio: (id: string) => invoke(IpcChannels.studiosDelete, UuidV7Schema.parse(id)),
  assignSourceToStudio: (input: unknown) =>
    invoke(IpcChannels.studiosAssignSource, AssignSourceToStudioInputSchema.parse(input)),

  listCollections: (studioId: string) =>
    invoke(IpcChannels.collectionsList, UuidV7Schema.parse(studioId)),
  getCollection: (collectionId: string) =>
    invoke(IpcChannels.collectionsGet, UuidV7Schema.parse(collectionId)),
  createCollection: (input: unknown) =>
    invoke(IpcChannels.collectionsCreate, CreateCollectionInputSchema.parse(input)),
  updateCollection: (input: unknown) =>
    invoke(IpcChannels.collectionsUpdate, UpdateCollectionInputSchema.parse(input)),
  deleteCollection: (collectionId: string) =>
    invoke(IpcChannels.collectionsDelete, UuidV7Schema.parse(collectionId)),
  addSourceToCollection: (input: unknown) =>
    invoke(IpcChannels.collectionsAddSource, CollectionMembershipInputSchema.parse(input)),
  removeSourceFromCollection: (input: unknown) =>
    invoke(IpcChannels.collectionsRemoveSource, CollectionMembershipInputSchema.parse(input)),

  listInboxSources: () => invoke(IpcChannels.sourcesListInbox),
  getSource: (id: string) => invoke(IpcChannels.sourcesGet, UuidV7Schema.parse(id)),
  listSourceBlocks: (sourceId: string) =>
    invoke(IpcChannels.sourcesListBlocks, UuidV7Schema.parse(sourceId)),
  importTextSource: (input: unknown) =>
    invoke(IpcChannels.sourcesImportText, ImportTextSourceInputSchema.parse(input)),
  importPdfSource: (input: unknown) =>
    invoke(IpcChannels.sourcesImportPdf, ImportPdfSourceInputSchema.parse(input)),
  importUrlSource: (input: unknown) =>
    invoke(IpcChannels.sourcesImportUrl, ImportUrlSourceInputSchema.parse(input)),
  retrySource: (sourceId: string) => invoke(IpcChannels.sourcesRetry, UuidV7Schema.parse(sourceId)),
  archiveSource: (sourceId: string) =>
    invoke(IpcChannels.sourcesArchive, UuidV7Schema.parse(sourceId)),
  deleteSource: (sourceId: string) =>
    invoke(IpcChannels.sourcesDelete, UuidV7Schema.parse(sourceId)),
  importTranscriptSource: (input: unknown) =>
    invoke(IpcChannels.sourcesImportTranscript, ImportTranscriptSourceInputSchema.parse(input)),
  /** Multi-select PDF paths (empty array if cancelled). */
  pickPdfFiles: () => invoke<string[]>(IpcChannels.sourcesPickPdf),
  /** Multi-select transcript paths (empty array if cancelled). */
  pickTranscriptFiles: () => invoke<string[]>(IpcChannels.sourcesPickTranscript),
  /** @deprecated Prefer pickPdfFiles — kept for call sites that want a single path. */
  pickPdfFile: async () => {
    const paths = await invoke<string[]>(IpcChannels.sourcesPickPdf);
    return paths[0] ?? null;
  },
  pickTranscriptFile: async () => {
    const paths = await invoke<string[]>(IpcChannels.sourcesPickTranscript);
    return paths[0] ?? null;
  },
  getSourceProgress: (sourceId: string) =>
    invoke(IpcChannels.sourceProgress, UuidV7Schema.parse(sourceId)),

  startAgentSession: (input: unknown) =>
    invoke(IpcChannels.agentStartSession, StartLearnSessionInputSchema.parse(input)),
  sendAgentMessage: (input: unknown) =>
    invoke(IpcChannels.agentSendMessage, SendAgentMessageInputSchema.parse(input)),
  cancelAgent: (sessionId: string) =>
    invoke(IpcChannels.agentCancel, UuidV7Schema.parse(sessionId)),
  listAgentActivity: (sessionId: string) =>
    invoke(IpcChannels.agentListActivity, ListAgentActivityInputSchema.parse({ sessionId })),
  subscribeToAgentStream: (callback: (event: AgentStreamEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      callback(AgentStreamEventSchema.parse(raw));
    };
    ipcRenderer.on(IpcChannels.agentStreamEvent, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.agentStreamEvent, listener);
    };
  },

  startProbe: (input: unknown) =>
    invoke(IpcChannels.probeStart, StartProbeInputSchema.parse(input)),
  answerProbe: (input: unknown) =>
    invoke(IpcChannels.probeAnswer, AnswerProbeInputSchema.parse(input)),
  stopProbe: (probeId: string) => invoke(IpcChannels.probeStop, UuidV7Schema.parse(probeId)),
  getProbe: (probeId: string) => invoke(IpcChannels.probeGet, UuidV7Schema.parse(probeId)),
  getProbeLearningMap: (probeId: string) =>
    invoke(IpcChannels.probeGetLearningMap, UuidV7Schema.parse(probeId)),

  listToday: () => invoke(IpcChannels.todayList),
  completeTodayAction: (actionId: string) =>
    invoke(IpcChannels.todayCompleteAction, UuidV7Schema.parse(actionId)),
  dismissTodayAction: (actionId: string) =>
    invoke(IpcChannels.todayDismissAction, UuidV7Schema.parse(actionId)),

  getLearnerProfile: () => invoke(IpcChannels.learnerGetProfile),
  updateLearnerProfile: (input: unknown) => invoke(IpcChannels.learnerUpdateProfile, input),
  getConceptStates: (studioId: string) =>
    invoke(IpcChannels.learnerGetConceptStates, UuidV7Schema.parse(studioId)),
  correctLearner: (input: unknown) => invoke(IpcChannels.learnerCorrect, input),
  retractLearner: (input: unknown) => invoke(IpcChannels.learnerRetract, input),

  getUsageSummary: () => invoke(IpcChannels.usageGetSummary),
  getUsageLimits: () => invoke(IpcChannels.usageGetLimits),
  setUsageLimits: (input: unknown) => invoke(IpcChannels.usageSetLimits, input),

  exportBackup: () => invoke(IpcChannels.backupExport),
  restoreBackup: () => invoke(IpcChannels.backupRestore),
  exportStudioBackup: (studioId: string) =>
    invoke(IpcChannels.backupExportStudio, UuidV7Schema.parse(studioId)),
  previewDiagnostics: () => invoke(IpcChannels.diagnosticsPreview),
  exportDiagnostics: () => invoke(IpcChannels.diagnosticsExport),

  listJobs: () => invoke(IpcChannels.jobsList),

  openExternal: (url: string) => invoke(IpcChannels.shellOpenExternal, url),
  openPath: (target: string) => invoke(IpcChannels.shellOpenPath, target),

  registerExtensionId: (extensionId: string) =>
    invoke(IpcChannels.extensionRegisterId, extensionId.trim()),
  listExtensionIds: () => invoke<string[]>(IpcChannels.extensionListIds),
} as const;

contextBridge.exposeInMainWorld('omakase', api);

export type OmakaseApi = typeof api;
