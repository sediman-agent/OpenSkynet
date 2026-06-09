import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/vscode-streaming.css';
import './styles/vscode-theme.css';
import { useAppStore } from './stores/useAppStore';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

console.log('[Main] Starting React app...');

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);
  const colorTheme = useAppStore((state) => state.colorTheme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.remove(
      'theme-blue',
      'theme-purple',
      'theme-green',
      'theme-rose',
      'theme-cyan'
    );

    if (colorTheme !== 'default') {
      document.documentElement.classList.add(`theme-${colorTheme}`);
    }
  }, [colorTheme]);

  return <>{children}</>;
}

try {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error('[Main] Root element not found!');
  } else {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }
} catch (error) {
  console.error('[Main] Failed to render:', error);
}

