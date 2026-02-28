import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import logo from '../assets/logo.png';

// Lazy load del componente 3D para mejor rendimiento inicial
const GasStation3D = lazy(() => import('../components/GasStation3D'));

export default function Home() {
  const { t } = useTranslation();
  
  return (
    <div className="relative overflow-x-hidden">
      {/* Fondo 3D animado */}
      <Suspense fallback={
        <div className="fixed inset-0 bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF]" />
      }>
        <GasStation3D />
      </Suspense>

      {/* Overlay con gradiente para mejorar legibilidad */}
      <div className="fixed inset-0 bg-linear-to-l from-white/70 via-white/40 to-transparent pointer-events-none" style={{ zIndex: 1 }} />

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Columna izquierda - Contenido */}
            <div className="text-left">
              <div className="mb-6">
                <img src={logo} alt="TankGo Logo" className="h-20 w-auto drop-shadow-lg" />
              </div>
              
              <h1 className="text-6xl lg:text-7xl font-bold text-[#000C74] leading-tight tracking-tight drop-shadow-lg mb-4">
                {t('home.title')}
              </h1>

              <h2 className="text-3xl lg:text-4xl font-semibold text-[#0A0F3D] leading-tight mb-6 drop-shadow-md">
                {t('home.subtitle')}
              </h2>

              <p className="text-[#2C2F55] text-lg lg:text-xl mb-8 max-w-xl drop-shadow-sm">
                {t('home.description')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="/gasolineras"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-[#000C74] text-white font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-[1.04] transition-all"
                >
                  {t('home.exploreStations')}
                  {' '}
                  <span className="text-xl">→</span>
                </a>
                <a
                  href="/mapa"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-[#000C74] font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-[1.04] transition-all border-2 border-[#000C74]"
                >
                  {t('home.viewMap')}
                  {' '}
                  <span className="text-xl">🗺️</span>
                </a>
              </div>
            </div>

            {/* Columna derecha - vacía para dejar espacio al 3D */}
            <div className="hidden lg:block"></div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="relative bg-white py-20" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-[#000C74] mb-4">
              {t('home.features.title')}
            </h2>
            <p className="text-xl text-[#2C2F55] max-w-2xl mx-auto">
              {t('home.features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 bg-linear-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">{t('home.features.realtime.title')}</h3>
              <p className="text-[#2C2F55]">
                {t('home.features.realtime.description')}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 bg-linear-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">📍</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">{t('home.features.location.title')}</h3>
              <p className="text-[#2C2F55]">
                {t('home.features.location.description')}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 bg-linear-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">{t('home.features.compare.title')}</h3>
              <p className="text-[#2C2F55]">
                {t('home.features.compare.description')}
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 bg-linear-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">⭐</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">{t('home.features.favorites.title')}</h3>
              <p className="text-[#2C2F55]">
                {t('home.features.favorites.description')}
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 bg-linear-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">🗺️</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">{t('home.features.map.title')}</h3>
              <p className="text-[#2C2F55]">
                {t('home.features.map.description')}
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 bg-linear-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">📈</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">{t('home.features.history.title')}</h3>
              <p className="text-[#2C2F55]">
                {t('home.features.history.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="relative bg-linear-to-br from-[#000C74] to-[#0A0F3D] text-white py-20" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              {t('home.howItWorks.title')}
            </h2>
            <p className="text-xl text-blue-200 max-w-2xl mx-auto">
              {t('home.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#6A75FF] rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-2xl font-bold mb-3">{t('home.howItWorks.step1.title')}</h3>
              <p className="text-blue-200">
                {t('home.howItWorks.step1.description')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#6A75FF] rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-2xl font-bold mb-3">{t('home.howItWorks.step2.title')}</h3>
              <p className="text-blue-200">
                {t('home.howItWorks.step2.description')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#6A75FF] rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-2xl font-bold mb-3">{t('home.howItWorks.step3.title')}</h3>
              <p className="text-blue-200">
                {t('home.howItWorks.step3.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative bg-white py-20" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-[#000C74] mb-6">
            {t('home.cta.title')}
          </h2>
          <p className="text-xl text-[#2C2F55] mb-8 max-w-2xl mx-auto">
            {t('home.cta.subtitle')}
          </p>
          <a
            href="/register"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#6A75FF] text-white text-lg font-semibold rounded-full shadow-xl hover:shadow-2xl hover:scale-[1.06] transition-all"
          >
            {t('home.cta.button')}
            {' '}
            <span className="text-2xl">🚀</span>
          </a>
        </div>
      </section>
    </div>
  );
}
