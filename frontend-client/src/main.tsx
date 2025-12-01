import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

// Inicializar i18n (debe importarse antes de renderizar)
import './i18n';

// Google OAuth Client ID (configurar en Google Cloud Console)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
// PWA registration (vite-plugin-pwa provides `virtual:pwa-register`)
// Load the virtual module dynamically and catch failures so the app
// still runs if the plugin isn't installed yet (useful during setup).
if (import.meta.env.PROD) {
  // @ts-ignore - module injected by vite-plugin-pwa at build time
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        onNeedRefresh() {
          alert('Nueva versión disponible. Por favor, actualiza la página.');
        },
        onOfflineReady() {
          alert('El contenido está listo para usarse sin conexión.');
        }
      });
    })
    .catch(() => {
      // ignore: plugin not installed or running in an environment
      // where the virtual module is not available
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
