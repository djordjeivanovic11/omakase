import type { ProviderProfile } from '@omakase/contracts';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

export function YouPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [profile, setProfile] = useState<Awaited<
    ReturnType<typeof getApi>['getLearnerProfile']
  > | null>(null);
  const [usage, setUsage] = useState<{ totalMicrousd: number; eventCount: number } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [providerKind, setProviderKind] = useState<'openai' | 'anthropic' | 'openrouter'>('openai');
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [mockAllowed, setMockAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionId, setExtensionId] = useState('');
  const [extensionIds, setExtensionIds] = useState<string[]>([]);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);

  useEffect(() => {
    void getApi().listProviders().then(setProviders);
    void getApi()
      .getLearnerProfile()
      .then((p: { displayName?: string | null } | null) => {
        setProfile(p);
        setDisplayName(p?.displayName ?? '');
      });
    void getApi().getUsageSummary().then(setUsage);
    void getApi()
      .getAppInfo()
      .then((info: { version?: string; mockProviderEnabled?: boolean }) => {
        setAppVersion(info.version ?? null);
        setMockAllowed(Boolean(info.mockProviderEnabled));
      });
    void getApi()
      .listExtensionIds()
      .then(setExtensionIds)
      .catch(() => setExtensionIds([]));
  }, []);

  const refresh = () => {
    void getApi().listProviders().then(setProviders);
    void getApi()
      .getLearnerProfile()
      .then((p: { displayName?: string | null } | null) => {
        setProfile(p);
        setDisplayName(p?.displayName ?? '');
      });
    void getApi().getUsageSummary().then(setUsage);
  };

  const addProvider = async () => {
    if (!apiKey.trim()) return;
    setError(null);
    try {
      const profile = (await getApi().createProvider({
        provider: providerKind,
        apiKey: apiKey.trim(),
        defaultModelId: providerKind === 'openai' ? 'gpt-5.6' : undefined,
      })) as { id: string };
      await getApi().testProvider(profile.id, providerKind === 'openai' ? 'gpt-5.6' : undefined);
      setApiKey('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save provider');
    }
  };

  const addMockProvider = async () => {
    setError(null);
    try {
      await getApi().createProvider({
        provider: 'openai',
        displayName: 'Local mock (testing)',
        apiKey: 'mock-local-key',
        defaultModelId: 'mock-learn-v1',
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create mock provider');
    }
  };

  const saveProfile = async () => {
    await getApi().updateLearnerProfile({ displayName: displayName.trim() || null });
    refresh();
  };

  const registerExtension = async () => {
    setError(null);
    setExtensionNotice(null);
    try {
      const result = await getApi().registerExtensionId(extensionId.trim());
      setExtensionIds(result.allowedExtensionIds);
      setExtensionId('');
      setExtensionNotice('Extension connected. Restart Chrome/Edge if capture still fails.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register extension');
    }
  };

  return (
    <div>
      <h1 className="page-title">You</h1>
      <p className="page-lead">Your learning profile, providers, and data — all on this device.</p>

      <section className="card stack">
        <h2>Learner profile</h2>
        <div className="form-field">
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <Button onClick={() => void saveProfile()}>Save profile</Button>
        {profile?.summary ? <p className="muted">{profile.summary}</p> : null}
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Model provider</h2>
        <p className="muted">Bring your own key. Omakase calls providers directly from this app.</p>
        {providers.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{p.displayName}</strong>
              {p.keySuffix ? <span className="muted"> · {p.keySuffix}</span> : null}
            </div>
            <span className="status-pill">{p.lastVerification ?? 'untested'}</span>
          </div>
        ))}
        <div className="form-field">
          <label htmlFor="provider-kind">Provider</label>
          <select
            id="provider-kind"
            value={providerKind}
            onChange={(e) => setProviderKind(e.target.value as typeof providerKind)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="api-key">API key</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="row">
          <Button variant="primary" onClick={() => void addProvider()}>
            Save provider
          </Button>
          {mockAllowed ? (
            <Button onClick={() => void addMockProvider()}>Local mock (testing)</Button>
          ) : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Usage</h2>
        {usage ? (
          <p>
            Estimated spend: {(usage.totalMicrousd / 1_000_000).toFixed(4)} USD across{' '}
            {usage.eventCount} calls.
          </p>
        ) : (
          <p className="muted">No usage recorded yet.</p>
        )}
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Browser capture</h2>
        <p className="muted">
          Install the Omakase extension, then paste the ID from{' '}
          <code>chrome://extensions</code> (or Edge’s extensions page) so this Mac can accept
          captures.
        </p>
        {extensionIds.length > 0 ? (
          <ul className="muted">
            {extensionIds.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No extension IDs registered yet.</p>
        )}
        <div className="form-field">
          <label htmlFor="extension-id">Extension ID</label>
          <input
            id="extension-id"
            value={extensionId}
            onChange={(e) => setExtensionId(e.target.value)}
            placeholder="abcdefghijklmnopabcdefghijklmnop"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button onClick={() => void registerExtension()} disabled={!extensionId.trim()}>
          Connect extension
        </Button>
        {extensionNotice ? <p className="muted">{extensionNotice}</p> : null}
      </section>

      <section className="card stack" style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Your data</h2>
        <div className="row">
          <Button onClick={() => void getApi().exportBackup()}>Export library</Button>
          <Button onClick={() => void getApi().restoreBackup()}>Restore library</Button>
          <Button onClick={() => void getApi().exportDiagnostics()}>Export diagnostics</Button>
        </div>
        <Button variant="ghost" onClick={() => navigate('/onboarding')}>
          Review onboarding
        </Button>
      </section>

      <p className="muted" style={{ marginTop: 'var(--space-xl)' }}>
        Omakase {appVersion ?? '…'} · MIT · Local-first
      </p>
    </div>
  );
}
