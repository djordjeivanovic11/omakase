/**
 * Named IPC channel constants. Preload exposes only named domain methods —
 * never generic invoke/send.
 */
export const IpcChannels = {
  appGetInfo: 'app:getInfo',
  appGetOnboardingState: 'app:getOnboardingState',
  appCompleteOnboarding: 'app:completeOnboarding',

  providersList: 'providers:list',
  providersCreate: 'providers:create',
  providersTest: 'providers:test',
  providersSetDefaultModel: 'providers:setDefaultModel',
  providersDelete: 'providers:delete',
  providersListModels: 'providers:listModels',

  studiosList: 'studios:list',
  studiosGet: 'studios:get',
  studiosCreate: 'studios:create',
  studiosUpdate: 'studios:update',
  studiosDelete: 'studios:delete',
  studiosAssignSource: 'studios:assignSource',

  sourcesListInbox: 'sources:listInbox',
  sourcesGet: 'sources:get',
  sourcesListBlocks: 'sources:listBlocks',
  sourcesImportText: 'sources:importText',
  sourcesImportPdf: 'sources:importPdf',
  sourcesImportUrl: 'sources:importUrl',
  sourcesImportTranscript: 'sources:importTranscript',
  sourcesRetry: 'sources:retry',
  sourcesArchive: 'sources:archive',
  sourcesDelete: 'sources:delete',
  sourcesPickPdf: 'sources:pickPdf',
  sourcesPickTranscript: 'sources:pickTranscript',

  agentStartSession: 'agent:startSession',
  agentSendMessage: 'agent:sendMessage',
  agentCancel: 'agent:cancel',
  agentStreamEvent: 'agent:streamEvent',

  probeStart: 'probe:start',
  probeAnswer: 'probe:answer',
  probeStop: 'probe:stop',
  probeGet: 'probe:get',
  probeGetLearningMap: 'probe:getLearningMap',

  todayList: 'today:list',
  todayCompleteAction: 'today:completeAction',
  todayDismissAction: 'today:dismissAction',

  learnerGetProfile: 'learner:getProfile',
  learnerUpdateProfile: 'learner:updateProfile',
  learnerGetConceptStates: 'learner:getConceptStates',
  learnerCorrect: 'learner:correct',
  learnerRetract: 'learner:retract',

  usageGetSummary: 'usage:getSummary',
  usageGetLimits: 'usage:getLimits',
  usageSetLimits: 'usage:setLimits',

  backupExport: 'backup:export',
  backupRestore: 'backup:restore',
  backupExportStudio: 'backup:exportStudio',
  diagnosticsPreview: 'diagnostics:preview',
  diagnosticsExport: 'diagnostics:export',

  jobsList: 'jobs:list',
  sourceProgress: 'sources:progress',

  shellOpenExternal: 'shell:openExternal',
  shellOpenPath: 'shell:openPath',

  extensionRegisterId: 'extension:registerId',
  extensionListIds: 'extension:listIds',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
