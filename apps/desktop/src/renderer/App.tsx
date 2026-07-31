import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { getApi } from './api.js';
import { Nav } from './components/Nav.js';
import { InboxPage } from './pages/InboxPage.js';
import { LearnPage } from './pages/LearnPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { ProbePage } from './pages/ProbePage.js';
import { SourcePage } from './pages/SourcePage.js';
import { StudioDetailPage } from './pages/StudioDetailPage.js';
import { StudiosPage } from './pages/StudiosPage.js';
import { TodayPage } from './pages/TodayPage.js';
import { YouPage } from './pages/YouPage.js';

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    void getApi()
      .getOnboardingState()
      .then((state: { completed: boolean; hasProvider: boolean; hasStudio: boolean }) => {
        setCompleted(state.completed);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (ready === null) return <p className="muted">Loading…</p>;
  if (!completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/*"
            element={
              <OnboardingGate>
                <Nav />
                <main className="app-main">
                  <Routes>
                    <Route path="/" element={<TodayPage />} />
                    <Route path="/studios" element={<StudiosPage />} />
                    <Route path="/studios/:studioId" element={<StudioDetailPage />} />
                    <Route path="/studios/:studioId/probe" element={<ProbePage />} />
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/you" element={<YouPage />} />
                    <Route path="/sources/:sourceId" element={<SourcePage />} />
                    <Route path="/sources/:sourceId/learn" element={<LearnPage />} />
                    <Route path="/sources/:sourceId/probe" element={<ProbePage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </OnboardingGate>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
