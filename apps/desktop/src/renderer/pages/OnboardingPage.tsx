import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getApi } from '../api.js';
import { Button } from '../components/Button.js';
import { OPENAI_TEACHING_PRESETS } from '../lib/teaching-presets.js';

type ProviderKind = 'openai' | 'anthropic' | 'openrouter';
type Step = 'connect' | 'teacher' | 'studio';

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('connect');
  const [studioName, setStudioName] = useState('');
  const [objective, setObjective] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [mockAllowed, setMockAllowed] = useState(false);
  const [providerKind, setProviderKind] = useState<ProviderKind>('openai');
  const [apiKey, setApiKey] = useState('');
  const [teachingPreset, setTeachingPreset] = useState<(typeof OPENAI_TEACHING_PRESETS)[number]['id']>(
    'best',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    void getApi()
      .getOnboardingState()
      .then((state: { completed: boolean; hasProvider: boolean }) => {
        if (state.completed) navigate('/', { replace: true });
        if (state.hasProvider) setStep('teacher');
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
    setVerifying(true);
    setError(null);
    try {
      const preset = OPENAI_TEACHING_PRESETS.find((p) => p.id === teachingPreset);
      const profile = (await getApi().createProvider({
        provider: providerKind,
        apiKey: apiKey.trim(),
        defaultModelId:
          providerKind === 'openai' ? (preset?.modelId ?? 'gpt-5.6') : undefined,
      })) as { id: string };
      setProfileId(profile.id);
      await getApi().testProvider(
        profile.id,
        providerKind === 'openai' ? preset?.modelId : undefined,
      );
      setApiKey('');
      setStep(providerKind === 'openai' ? 'teacher' : 'studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify provider');
    } finally {
      setBusy(false);
      setVerifying(false);
    }
  };

  const chooseTeacher = async () => {
    if (!profileId) {
      setStep('studio');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const preset = OPENAI_TEACHING_PRESETS.find((p) => p.id === teachingPreset)!;
      await getApi().setDefaultModel(profileId, preset.modelId);
      setStep('studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save model choice');
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
      setStep('studio');
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
    <div style={{ maxWidth: 520, margin: '4rem auto' }}>
      <h1 className="page-title">Welcome to Omakase</h1>
      <p className="page-lead">
        Learn deeply from the sources you care about. Your library and learning history stay on this
        device.
      </p>

      {step === 'connect' ? (
        <section className="stack">
          <h2>Connect OpenAI</h2>
          <p className="muted">Requests go directly to the provider — nothing is proxied.</p>
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
          <Button variant="primary" onClick={() => void connectProvider()} disabled={busy}>
            {verifying ? 'Verifying…' : 'Connect'}
          </Button>
          {mockAllowed ? (
            <Button onClick={() => void connectMock()} disabled={busy}>
              Use local mock (testing)
            </Button>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      ) : null}

      {step === 'teacher' ? (
        <section className="stack">
          <h2>Choose your teacher</h2>
          {OPENAI_TEACHING_PRESETS.map((preset) => (
            <label key={preset.id} className="list-row" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="teaching"
                checked={teachingPreset === preset.id}
                onChange={() => setTeachingPreset(preset.id)}
              />{' '}
              <strong>{preset.label}</strong>
              <div className="muted">{preset.detail}</div>
            </label>
          ))}
          <Button variant="primary" onClick={() => void chooseTeacher()} disabled={busy}>
            Continue
          </Button>
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      ) : null}

      {step === 'studio' ? (
        <section className="stack">
          <h2>Create your first studio</h2>
          <div className="form-field">
            <label htmlFor="onboard-studio">Studio name</label>
            <input
              id="onboard-studio"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              placeholder="e.g. Diffusion models"
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
      ) : null}
    </div>
  );
}
