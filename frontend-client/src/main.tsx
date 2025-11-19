import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
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
    <BrowserRouter>
        <App />
    </BrowserRouter>
  </React.StrictMode>
);
