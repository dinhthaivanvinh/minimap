import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage } from './pages/AdminPage.tsx';
import { MePage } from './pages/MePage.tsx';
import { MonitorPage } from './pages/MonitorPage.tsx';
import { GlobalStyle } from './styles/GlobalStyle.ts';

// Voting is its own page, so the map doesn't download it.
const VotePage = lazy(() => import('./pages/VotePage.tsx').then((m) => ({ default: m.VotePage })));

const AccountPage = lazy(() => import('./pages/AccountPage.tsx').then(m => ({ default: m.AccountPage })));

function Page() {
  switch (location.pathname) {
    case '/account':
      return <Suspense fallback={null}><AccountPage /></Suspense>;
    case '/me':
      return <MePage />;
    case '/admin':
      return <AdminPage />;
    case '/vote':
      return (
        <Suspense fallback={null}>
          <VotePage />
        </Suspense>
      );
    default:
      return <MonitorPage />;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStyle />
    <Page />
  </StrictMode>,
);
