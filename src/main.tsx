import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage } from './pages/AdminPage.tsx';
import { MePage } from './pages/MePage.tsx';
import { MonitorPage } from './pages/MonitorPage.tsx';
import { GlobalStyle } from './styles/GlobalStyle.ts';

function Page() {
  switch (location.pathname) {
    case '/me':
      return <MePage />;
    case '/admin':
      return <AdminPage />;
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
