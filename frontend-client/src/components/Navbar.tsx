import { Link, NavLink } from "react-router-dom";
import { FiMapPin } from "react-icons/fi";
import { MdLocalGasStation } from "react-icons/md";
import { FaUser, FaSignOutAlt, FaHeart } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { useFavorites } from "../hooks/useFavorites";
import { useState } from "react";
import logo from "../assets/logo.png";

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { favoritos } = useFavorites();

  const linkStyle = ({ isActive }: any) =>
    `px-4 py-2 rounded-full transition font-medium ${
      isActive
        ? "text-[#000C74] bg-[#E4E7FF]"
        : "text-[#3A3D55] hover:text-[#000C74] hover:bg-[#DEE1FF]"
    }`;

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  return (
    <header className="backdrop-blur-xl bg-white/70 border-b border-[#D9DBF2]/60 sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center"
        >
          <img 
            src={logo} 
            alt="TankGo Logo" 
            className="h-12 w-auto object-contain"
          />
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

          {isAuthenticated && (
            <NavLink to="/favoritos" className={linkStyle}>
              <span className="flex items-center gap-2">
                <FaHeart size={16}/> Favoritos
                {favoritos.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {favoritos.length}
                  </span>
                )}
              </span>
            </NavLink>
          )}

          {/* Auth Buttons */}
          {isAuthenticated ? (
            <div className="relative ml-2">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#000C74] text-white hover:bg-[#001A8A] transition font-medium"
              >
                <FaUser size={14} />
                <span>{user?.nombre || 'Usuario'}</span>
              </button>
              
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  <Link
                    to="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="block px-4 py-3 hover:bg-gray-50 transition flex items-center gap-2 text-gray-700"
                  >
                    <FaUser size={14} />
                    Mi Perfil
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 hover:bg-red-50 transition flex items-center gap-2 text-red-600 border-t border-gray-100"
                  >
                    <FaSignOutAlt size={14} />
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 ml-2">
              <Link
                to="/login"
                className="px-4 py-2 rounded-full text-[#000C74] hover:bg-[#E4E7FF] transition font-medium"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 rounded-full bg-[#000C74] text-white hover:bg-[#001A8A] transition font-medium"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>

      </nav>
    </header>
  );
}
