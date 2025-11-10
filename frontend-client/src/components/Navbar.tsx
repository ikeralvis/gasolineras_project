import { Link, NavLink } from "react-router-dom";
import { FiMapPin } from "react-icons/fi";
import { MdLocalGasStation } from "react-icons/md";

export default function Navbar() {
  const linkStyle = ({ isActive }: any) =>
    `px-4 py-2 rounded-full transition font-medium ${
      isActive
        ? "text-[#000C74] bg-[#E4E7FF]"
        : "text-[#3A3D55] hover:text-[#000C74] hover:bg-[#DEE1FF]"
    }`;

  return (
    <header className="backdrop-blur-xl bg-white/70 border-b border-[#D9DBF2]/60 sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link
          to="/"
          className="text-2xl font-bold tracking-tight text-[#000C74]"
        >
          TankGo
        </Link>

        {/* Links */}
        <div className="flex items-center gap-2">
          <NavLink to="/" className={linkStyle}>
            Inicio
          </NavLink>

          <NavLink to="/gasolineras" className={linkStyle}>
            <span className="flex items-center gap-2">
              <MdLocalGasStation size={18}/> Gasolineras
            </span>
          </NavLink>

          <NavLink to="/mapa" className={linkStyle}>
            <span className="flex items-center gap-2">
              <FiMapPin size={18}/> Mapa
            </span>
          </NavLink>
        </div>

      </nav>
    </header>
  );
}
