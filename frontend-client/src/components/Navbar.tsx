import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="flex justify-between items-center px-6 py-3 shadow-sm glass">
      <Link to="/" className="text-xl font-bold tracking-tight text-gray-900">Gasolineras</Link>
      <div className="flex gap-4 items-center">
        {user ? (
          <>
            <Link to="/profile" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition">{user.nombre}</Link>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1 rounded transition">
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition">Login</Link>
            <Link to="/register" className="text-sm font-medium text-gray-700 hover:text-gray-900 transition">Registro</Link>
          </>
        )}
      </div>
    </nav>
  );
}
