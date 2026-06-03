import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Set up Tauri window title bar if needed
if (window.__TAURI__) {
  console.log('[Tauri] Running in Tauri context');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
