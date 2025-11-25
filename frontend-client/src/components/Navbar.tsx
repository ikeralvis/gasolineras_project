import { Link, NavLink } from "react-router-dom";
import { FiMapPin, FiMenu, FiX } from "react-icons/fi";
import { MdLocalGasStation } from "react-icons/md";
import { FaUser, FaSignOutAlt, FaHeart } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { useFavorites } from "../hooks/useFavorites";
import { useState, useEffect, useRef } from "react";
import logo from "../assets/logo.png";

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { favoritos } = useFavorites();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar menús al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        const menuButton = document.getElementById('mobile-menu-button');
        if (!menuButton?.contains(event.target as Node)) {
          setShowMobileMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setShowMobileMenu(false);
  }, []);

  const linkStyle = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-full transition font-medium ${
      isActive
        ? "text-[#000C74] bg-[#E4E7FF]"
        : "text-[#3A3D55] hover:text-[#000C74] hover:bg-[#DEE1FF]"
    }`;

  const mobileLinkStyle = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium ${
      isActive
        ? "text-[#000C74] bg-[#E4E7FF]"
        : "text-[#3A3D55] hover:text-[#000C74] hover:bg-[#DEE1FF]"
    }`;

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    setShowMobileMenu(false);
  };

  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };

  return (
    <header className="backdrop-blur-xl bg-white/70 border-b border-[#D9DBF2]/60 sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center"
          onClick={closeMobileMenu}
        >
          <img 
            src={logo} 
            alt="TankGo Logo" 
            className="h-10 sm:h-12 w-auto object-contain"
          />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-2">
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

          {/* Auth Buttons Desktop */}
          {isAuthenticated ? (
            <div className="relative ml-2" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                onBlur={() => setTimeout(() => setShowUserMenu(false), 150)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#000C74] text-white hover:bg-[#001A8A] transition font-medium focus:outline-none focus:ring-2 focus:ring-[#6A75FF] focus:ring-offset-2"
              >
                <FaUser size={14} />
                <span>{user?.nombre || 'Usuario'}</span>
              </button>
              
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  <Link
                    to="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition text-gray-700"
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

        {/* Mobile Menu Button */}
        <button
          id="mobile-menu-button"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="md:hidden p-2 rounded-lg hover:bg-[#E4E7FF] transition focus:outline-none focus:ring-2 focus:ring-[#6A75FF]"
          aria-label="Menú"
        >
          {showMobileMenu ? (
            <FiX size={24} className="text-[#000C74]" />
          ) : (
            <FiMenu size={24} className="text-[#000C74]" />
          )}
        </button>
      </nav>

      {/* Mobile Menu Dropdown */}
      {showMobileMenu && (
        <div 
          ref={mobileMenuRef}
          className="md:hidden absolute top-16 left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-[#D9DBF2]/60 shadow-lg"
        >
          <div className="px-4 py-4 space-y-2">
            <NavLink to="/" className={mobileLinkStyle} onClick={closeMobileMenu}>
              Inicio
            </NavLink>

            <NavLink to="/gasolineras" className={mobileLinkStyle} onClick={closeMobileMenu}>
              <MdLocalGasStation size={20}/> Gasolineras
            </NavLink>

            <NavLink to="/mapa" className={mobileLinkStyle} onClick={closeMobileMenu}>
              <FiMapPin size={20}/> Mapa
            </NavLink>

            {isAuthenticated && (
              <NavLink to="/favoritos" className={mobileLinkStyle} onClick={closeMobileMenu}>
                <FaHeart size={18}/> Favoritos
                {favoritos.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ml-auto">
                    {favoritos.length}
                  </span>
                )}
              </NavLink>
            )}

            {/* Separador */}
            <div className="border-t border-[#D9DBF2]/60 my-3"></div>

            {/* Auth Buttons Mobile */}
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  onClick={closeMobileMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#3A3D55] hover:bg-[#E4E7FF] transition font-medium"
                >
                  <FaUser size={18} />
                  Mi Perfil ({user?.nombre || 'Usuario'})
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition font-medium"
                >
                  <FaSignOutAlt size={18} />
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  to="/login"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center px-4 py-3 rounded-xl text-[#000C74] border-2 border-[#000C74] hover:bg-[#E4E7FF] transition font-medium"
                >
                  Iniciar Sesión
                </Link>
                <Link
                  to="/register"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center px-4 py-3 rounded-xl bg-[#000C74] text-white hover:bg-[#001A8A] transition font-medium"
                >
                  Registrarse
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
