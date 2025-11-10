export default function Home() {
  return (
    <div className="relative overflow-hidden min-h-[90vh] flex items-center justify-center bg-gradient-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF]">

      {/* Efecto difuminado circular */}
      <div className="absolute top-[-20%] left-[-10%] w-[550px] h-[550px] bg-[#000C74]/20 rounded-full blur-[130px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#6A75FF]/25 rounded-full blur-[140px]" />

      <div className="relative z-10 text-left px-8 max-w-4xl">
        <h1 className="text-7xl font-bold text-[#000C74] leading-tight tracking-tight drop-shadow-sm">
          TankGo
        </h1>

        <h2 className="mt-2 text-5xl font-semibold text-[#0A0F3D] leading-tight max-w-2xl">
          Plataforma Inteligente de Precios de Carburantes
        </h2>

        <p className="mt-6 text-[#2C2F55] text-lg max-w-xl">
          Datos actualizados en tiempo real, visualización avanzada y análisis automático para ayudarte a encontrar la mejor opción en cada repostaje.
        </p>

        <a
          href="/gasolineras"
          className="inline-flex items-center gap-3 mt-10 px-8 py-4 bg-[#000C74] text-white font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-[1.04] transition-all"
        >
          Explorar Gasolineras
          <span className="text-xl">→</span>
        </a>
      </div>

    </div>
  );
}
