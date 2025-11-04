export default function Home() {
  return (
    <div className="w-full max-w-xl mx-auto glass p-10 text-center">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 tracking-tight">Gasolineras España</h1>
      <p className="text-lg text-gray-500 mb-6">Consulta precios y ubicación de gasolineras en España de forma rápida y sencilla.</p>
      <div className="flex flex-col gap-4 items-center">
        <a href="/profile" className="px-6 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition">Mi perfil</a>
        <span className="text-xs text-gray-400">Próximamente: mapa y favoritos</span>
      </div>
    </div>
  );
}
