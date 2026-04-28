import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white/80 mt-10">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">TankGo</p>
            <p className="text-xs text-gray-500">Datos oficiales de precios de carburantes en Espana.</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            <Link to="/legal" className="hover:text-[#000C74]">Aviso legal</Link>
            <Link to="/privacy" className="hover:text-[#000C74]">Politica de privacidad</Link>
            <Link to="/accessibility" className="hover:text-[#000C74]">Accesibilidad</Link>
            <Link to="/faq" className="hover:text-[#000C74]">FAQ</Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 text-xs text-gray-500 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} TankGo. Todos los derechos reservados.</span>
          <span>Contacto: soporte@tankgo.dev</span>
        </div>
      </div>
    </footer>
  );
}
