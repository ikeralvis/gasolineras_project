import { Suspense, lazy } from 'react';
import logo from '../assets/logo.png';

// Lazy load del componente 3D para mejor rendimiento inicial
const GasStation3D = lazy(() => import('../components/GasStation3D'));

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Fondo 3D animado - posicionado a la izquierda */}
      <Suspense fallback={
        <div className="fixed inset-0 bg-gradient-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF]" />
      }>
        <GasStation3D className="transform -translate-x-[20%]" />
      </Suspense>

      {/* Overlay con gradiente para mejorar legibilidad */}
      <div className="fixed inset-0 bg-gradient-to-r from-white/70 via-white/40 to-transparent pointer-events-none" style={{ zIndex: 1 }} />

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Columna izquierda - vacía para dejar espacio al 3D */}
            <div className="hidden lg:block"></div>

            {/* Columna derecha - Contenido */}
            <div className="text-left">
              <div className="mb-6">
                <img src={logo} alt="TankGo Logo" className="h-20 w-auto drop-shadow-lg" />
              </div>
              
              <h1 className="text-6xl lg:text-7xl font-bold text-[#000C74] leading-tight tracking-tight drop-shadow-lg mb-4">
                TankGo
              </h1>

              <h2 className="text-3xl lg:text-4xl font-semibold text-[#0A0F3D] leading-tight mb-6 drop-shadow-md">
                Plataforma Inteligente de Precios de Carburantes
              </h2>

              <p className="text-[#2C2F55] text-lg lg:text-xl mb-8 max-w-xl drop-shadow-sm">
                Datos actualizados en tiempo real, visualización avanzada y análisis automático para ayudarte a encontrar la mejor opción en cada repostaje.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="/gasolineras"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-[#000C74] text-white font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-[1.04] transition-all"
                >
                  Explorar Gasolineras
                  {' '}
                  <span className="text-xl">→</span>
                </a>
                <a
                  href="/mapa"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-[#000C74] font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-[1.04] transition-all border-2 border-[#000C74]"
                >
                  Ver Mapa
                  {' '}
                  <span className="text-xl">🗺️</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="relative bg-white py-20" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-[#000C74] mb-4">
              Funcionalidades Principales
            </h2>
            <p className="text-xl text-[#2C2F55] max-w-2xl mx-auto">
              Todo lo que necesitas para ahorrar en cada repostaje
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 bg-gradient-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">Precios en Tiempo Real</h3>
              <p className="text-[#2C2F55]">
                Accede a información actualizada de todas las gasolineras de España. Datos oficiales del Ministerio directamente en tu pantalla.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 bg-gradient-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">📍</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">Búsqueda por Ubicación</h3>
              <p className="text-[#2C2F55]">
                Encuentra las estaciones más cercanas a ti. Filtra por provincia, localidad o visualiza en el mapa interactivo.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 bg-gradient-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">Comparación de Precios</h3>
              <p className="text-[#2C2F55]">
                Compara precios de diferentes combustibles: Gasolina 95, 98, Diésel, Diésel Premium y más. Ordena por precio para encontrar la mejor oferta.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 bg-gradient-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">⭐</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">Favoritos Personalizados</h3>
              <p className="text-[#2C2F55]">
                Guarda tus gasolineras favoritas y accede rápidamente a ellas. Configura tu combustible preferido para ver solo lo que te interesa.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 bg-gradient-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">🗺️</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">Mapa Interactivo</h3>
              <p className="text-[#2C2F55]">
                Visualiza todas las gasolineras en un mapa. Explora por zonas, encuentra rutas y planifica tus paradas de forma inteligente.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 bg-gradient-to-br from-[#E8EAFE] to-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="text-5xl mb-4">📈</div>
              <h3 className="text-2xl font-bold text-[#000C74] mb-3">Historial de Precios</h3>
              <p className="text-[#2C2F55]">
                Consulta la evolución histórica de precios. Identifica tendencias y decide el mejor momento para repostar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="relative bg-gradient-to-br from-[#000C74] to-[#0A0F3D] text-white py-20" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              ¿Cómo Funciona?
            </h2>
            <p className="text-xl text-blue-200 max-w-2xl mx-auto">
              Tres simples pasos para empezar a ahorrar
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#6A75FF] rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-2xl font-bold mb-3">Regístrate Gratis</h3>
              <p className="text-blue-200">
                Crea tu cuenta en segundos. Sin costes, sin compromiso.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#6A75FF] rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-2xl font-bold mb-3">Busca y Compara</h3>
              <p className="text-blue-200">
                Explora gasolineras, filtra por ubicación y compara precios al instante.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-[#6A75FF] rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-2xl font-bold mb-3">Ahorra Dinero</h3>
              <p className="text-blue-200">
                Elige la mejor opción y ahorra en cada repostaje. ¡Así de simple!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative bg-white py-20" style={{ zIndex: 2 }}>
        <div className="container mx-auto px-8 lg:px-16 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-[#000C74] mb-6">
            ¿Listo para Empezar a Ahorrar?
          </h2>
          <p className="text-xl text-[#2C2F55] mb-8 max-w-2xl mx-auto">
            Únete a miles de usuarios que ya están optimizando sus gastos en combustible
          </p>
          <a
            href="/register"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#6A75FF] text-white text-lg font-semibold rounded-full shadow-xl hover:shadow-2xl hover:scale-[1.06] transition-all"
          >
            Crear Cuenta Gratis
            {' '}
            <span className="text-2xl">🚀</span>
          </a>
        </div>
      </section>
    </div>
  );
}
