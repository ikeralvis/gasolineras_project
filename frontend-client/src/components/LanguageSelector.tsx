import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';

import esFlag from '../assets/flags/es.svg';
import gbFlag from '../assets/flags/gb.svg';
import euFlag from '../assets/flags/eu.svg';

const languages = [
  { code: 'es', name: 'Español', flag: esFlag },
  { code: 'en', name: 'English', flag: gbFlag },
  { code: 'eu', name: 'Euskara', flag: euFlag }
];

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Normalizar código de idioma (p. ej. 'es-ES' -> 'es')
  const normalized = (i18n.language || '').split('-')[0];
  const currentLang = languages.find(lang => lang.code === normalized) || languages[0];

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-[#E4E7FF] transition text-[#3A3D55] font-medium"
          aria-label="Cambiar idioma"
        >
          <img src={currentLang.flag} alt={currentLang.code} className="w-5 h-5 rounded-sm object-cover" />
          <span className="hidden sm:inline text-sm">{currentLang.name}</span>
          <svg 
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left ${
                normalized === lang.code ? 'bg-[#E4E7FF] text-[#000C74]' : 'text-gray-700'
              }`}
            >
              <img src={lang.flag} alt={lang.code} className="w-6 h-4 object-cover rounded-sm" />
              <span className="font-medium">{lang.name}</span>
              {normalized === lang.code && (
                <svg className="w-4 h-4 ml-auto text-[#000C74]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
