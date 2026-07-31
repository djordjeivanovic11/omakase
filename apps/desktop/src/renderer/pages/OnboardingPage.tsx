import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';

type ProviderKind = 'openai' | 'anthropic' | 'openrouter';

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [studioName, setStudioName] = useState('');
  const [objective, setObjective] = useState('');
  const [providerReady, setProviderReady] = useState(false);
  const [mockAllowed, setMockAllowed] = useState(false);
  const [providerKind, setProviderKind] = useState<ProviderKind>('openai');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getApi()
      .getOnboardingState()
      .then((state: { completed: boolean; hasProvider: boolean }) => {
        if (state.completed) navigate('/', { replace: true });
        setProviderReady(state.hasProvider);
      });
    void getApi()
      .getAppInfo()
      .then((info: { mockProviderEnabled?: boolean }) => {
        setMockAllowed(Boolean(info.mockProviderEnabled));
      })
      .catch(() => setMockAllowed(false));
  }, [navigate]);

  const connectProvider = async () => {
    if (!apiKey.trim()) {
      setError('Paste an API key to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const profile = (await getApi().createProvider({
        provider: providerKind,
        apiKey: apiKey.trim(),
      })) as { id: string };
      await getApi().testProvider(profile.id);
      setApiKey('');
      setProviderReady(true);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify provider');
    } finally {
      setBusy(false);
    }
  };

  const connectMock = async () => {
    setBusy(true);
    setError(null);
    try {
      await getApi().createProvider({
        provider: 'openai',
        displayName: 'Local mock (testing)',
        apiKey: 'mock-local-key',
        defaultModelId: 'mock-learn-v1',
      });
      const providers = (await getApi().listProviders()) as Array<{
        displayName: string;
        id: string;
      }>;
      const mock = providers.find((p) => p.displayName.includes('mock'));
      if (mock) await getApi().testProvider(mock.id, 'mock-learn-v1');
      setProviderReady(true);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock provider failed');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!studioName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await getApi().createStudio({
        name: studioName.trim(),
        primaryObjective: objective.trim() || undefined,
      });
      await getApi().completeOnboarding();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish onboarding');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="page-title">Welcome to Omakase</h1>
      <p className="page-lead">
        A calm local studio for learning from your own sources — with citations, probes, and a map
        of what you actually understand.
      </p>

      {step === 0 ? (
        <section className="card stack">
          <h2>What you can expect</h2>
          <ul>
            <li>Your sources and notes stay on this device.</li>
            <li>Ask questions with citations back to the original material.</li>
            <li>Short adaptive probes validate what you really know.</li>
          </ul>
          <h2>Connect a model</h2>
          <p className="muted">
            Bring your own key. Omakase talks to the provider directly — nothing is proxied.
          </p>
          <div className="form-field">
            <label htmlFor="onboard-provider">Provider</label>
            <select
              id="onboard-provider"
              value={providerKind}
              onChange={(e) => setProviderKind(e.target.value as ProviderKind)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="onboard-key">API key</label>
            <input
              id="onboard-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              placeholder="sk-…"
            />
          </div>
          <div className="row">
            <Button
              variant="primary"
              onClick={() => void connectProvider()}
              disabled={busy || providerReady}
            >
              {providerReady ? 'Provider ready' : 'Save & verify key'}
            </Button>
            {providerReady ? <Button onClick={() => setStep(1)}>Continue</Button> : null}
          </div>
          {mockAllowed && !providerReady ? (
            <Button onClick={() => void connectMock()} disabled={busy}>
              Use local mock (testing)
            </Button>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      ) : (
        <section className="card stack">
          <h2>Create your first studio</h2>
          <div className="form-field">
            <label htmlFor="onboard-studio">Studio name</label>
            <input
              id="onboard-studio"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              placeholder="e.g. Linear algebra"
            />
          </div>
          <div className="form-field">
            <label htmlFor="onboard-objective">Learning goal</label>
            <textarea
              id="onboard-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          </div>
          <Button
            variant="primary"
            onClick={() => void finish()}
            disabled={busy || !studioName.trim()}
          >
            Start learning
          </Button>
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      )}
    </div>
  );
}
