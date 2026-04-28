import type { ComponentType } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  LogIn,
  LogOut,
  Map,
  Route,
  User,
  Zap,
  Fuel,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../hooks/useFavorites';
import LanguageSelector from './LanguageSelector';
import logo from '../assets/logo.png';

type DesktopItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  private?: boolean;
};

const NAV_ITEMS: DesktopItem[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/gasolineras', label: 'Gasolineras', icon: Fuel },
  { to: '/mapa', label: 'Mapa', icon: Map },
  { to: '/recarga', label: 'Recarga', icon: Zap },
  { to: '/rutas', label: 'Rutas', icon: Route, private: true },
];

type MobileItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const MOBILE_GUEST: MobileItem[] = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/gasolineras', label: 'Gas', icon: Fuel },
  { to: '/mapa', label: 'Mapa', icon: Map },
  { to: '/recarga', label: 'EV', icon: Zap },
  { to: '/login', label: 'Login', icon: LogIn },
];

const MOBILE_AUTH: MobileItem[] = [
  { to: '/gasolineras', label: 'Gas', icon: Fuel },
  { to: '/mapa', label: 'Mapa', icon: Map },
  { to: '/recarga', label: 'EV', icon: Zap },
  { to: '/rutas', label: 'Rutas', icon: Route },
  { to: '/profile', label: 'Perfil', icon: User },
];

function getTranslatedNavLabel(path: string, t: (key: string) => string) {
  const labelsByPath: Record<string, string> = {
    '/': 'nav.home',
    '/gasolineras': 'nav.gasStations',
    '/mapa': 'nav.map',
    '/recarga': 'nav.evCharging',
    '/rutas': 'nav.routes',
    '/favoritos': 'nav.favorites',
  };
  const key = labelsByPath[path] || 'nav.home';
  return t(key);
}

export default function Navbar() {
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();
  const { favoritos } = useFavorites();
  const location = useLocation();

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const showDesktopTop = !isAuthPage;
  const showBottomNav = !isAuthPage;
  const mobileItems = isAuthenticated ? MOBILE_AUTH : MOBILE_GUEST;

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {showDesktopTop && (
        <header className="sticky top-0 z-50 hidden border-b border-(--color-border) bg-white/70 backdrop-blur-xl md:block">
          <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
            <Link to="/" className="flex items-center gap-3">
              <img src={logo} alt="TankGo" className="h-10 w-auto object-contain" />
            </Link>

            <div className="flex items-center gap-1 rounded-full bg-white/75 p-1 ring-1 ring-(--color-border)">
              {NAV_ITEMS.filter((item) => (item.private ? isAuthenticated : true)).map((item) => {
                const Icon = item.icon;
                const translated = getTranslatedNavLabel(item.to, t);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'bg-(--color-primary) text-white'
                          : 'text-(--color-text-muted) hover:bg-white hover:text-(--color-primary)'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{translated}</span>
                    {item.to === '/favoritos' && favoritos.length > 0 && (
                      <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {favoritos.length}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <LanguageSelector />
              {isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <Link
                    to="/profile"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-medium text-(--color-primary) ring-1 ring-(--color-border) transition hover:bg-slate-50"
                  >
                    <User className="h-4 w-4" />
                    {user?.nombre || 'Usuario'}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('nav.logout')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/login"
                    className="rounded-full px-3 py-2 text-sm font-medium text-(--color-primary) transition hover:bg-white"
                  >
                    {t('nav.login')}
                  </Link>
                  <Link
                    to="/register"
                    className="rounded-full bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong)"
                  >
                    {t('nav.register')}
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </header>
      )}

      {showBottomNav && (
        <nav className="fixed inset-x-0 bottom-3 z-50 px-3 md:hidden" aria-label="Navegacion movil principal">
          <div className="mx-auto max-w-md rounded-2xl border border-(--color-border) bg-white/80 p-1.5 shadow-[0_12px_34px_rgba(18,26,58,0.18)] backdrop-blur-2xl">
            <ul
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
            >
              {mobileItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.to === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.to);

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className="relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium"
                    >
                      {isActive && (
                        <motion.span
                          layoutId="mobile-nav-active"
                          className="absolute inset-0 rounded-xl bg-(--color-primary)"
                          transition={{ type: 'spring', duration: 0.35, bounce: 0.22 }}
                        />
                      )}
                      <span className="relative z-10">
                        <Icon className={`h-4.25 w-4.25 ${isActive ? 'text-white' : 'text-(--color-text-muted)'}`} />
                      </span>
                      <span className={`relative z-10 leading-none ${isActive ? 'text-white' : 'text-(--color-text-muted)'}`}>
                        {item.label}
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      )}
    </>
  );
}
