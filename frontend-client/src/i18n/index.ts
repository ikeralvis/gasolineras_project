import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import es from './locales/es.json';
import en from './locales/en.json';
import eu from './locales/eu.json';

// Recursos de idiomas
const resources = {
  es: { translation: es },
  en: { translation: en },
  eu: { translation: eu }
};

// Configuración de i18n
i18n
  // Detecta el idioma del navegador
  .use(LanguageDetector)
  // Pasa el i18n a react-i18next
  .use(initReactI18next)
  // Configuración
  .init({
    resources,
    fallbackLng: 'es', // Idioma por defecto si no se detecta
    supportedLngs: ['es', 'en', 'eu'], // Idiomas soportados
    
    interpolation: {
      escapeValue: false // React ya escapa los valores
    },

    detection: {
      // Orden de detección de idioma
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Cachear en localStorage
      caches: ['localStorage'],
      // Key para localStorage
      lookupLocalStorage: 'i18nextLng'
    },

    react: {
      useSuspense: true
    }
  });

// Exportar para uso en la app
const i18nInstance = i18n;
export { i18nInstance as i18n };
