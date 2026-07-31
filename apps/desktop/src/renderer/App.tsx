import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
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
      .then((state: { completed: boolean }) => {
        setCompleted(state.completed);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (ready === null) return <p className="muted">Loading…</p>;
  if (!completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function Shell() {
  const location = useLocation();
  const wide = location.pathname.includes('/learn');

  return (
    <div className="app-shell">
      <Nav />
      <main className={wide ? 'app-main wide' : 'app-main'}>
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
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/onboarding"
          element={
            <div className="app-shell onboarding-shell">
              <main className="app-main">
                <OnboardingPage />
              </main>
            </div>
          }
        />
        <Route
          path="/*"
          element={
            <OnboardingGate>
              <Shell />
            </OnboardingGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
