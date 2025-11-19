import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FaUser, FaEnvelope, FaShieldAlt, FaHeart, FaTrash, FaSignOutAlt } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  is_admin: boolean;
}

interface Favorito {
  ideess: string;
  created_at: string;
}

export default function Profile() {
  const { token, logout } = useAuth();
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  // Fetch perfil y favoritos
  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/usuarios/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch(`${API_BASE}/api/usuarios/favoritos`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([perfilData, favoritosData]) => {
        if (perfilData.error) setError(perfilData.error);
        else setPerfil(perfilData);
        if (Array.isArray(favoritosData)) setFavoritos(favoritosData);
        else if (favoritosData.error) setError(favoritosData.error);
      })
      .catch(() => setError("Error al cargar datos de usuario"))
      .finally(() => setLoading(false));
  }, [token, navigate]);

  // Logout
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Eliminar cuenta
  const handleDelete = async () => {
    if (!globalThis.confirm("¿Seguro que quieres eliminar tu cuenta? Esta acción es irreversible.")) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/usuarios/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        logout();
        navigate("/register");
      } else {
        const data = await res.json();
        setError(data.error || "Error al eliminar cuenta");
      }
    } catch {
      setError("Error de red al eliminar cuenta");
    } finally {
      setLoading(false);
    }
  };

  // Render
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#000C74] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !perfil) {
    return (
      <div className="min-h-screen bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF] flex items-center justify-center px-4">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-xl max-w-md">
          <p className="text-red-700 font-medium">{error || "No se pudo cargar el perfil"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-[#E8EAFE] via-[#F1F2FF] to-[#E3E6FF] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white shadow-xl rounded-3xl overflow-hidden mb-6">
          <div className="bg-linear-to-r from-[#000C74] to-[#4A52D9] p-8 text-white">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-4 rounded-full backdrop-blur-sm">
                <FaUser className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">{perfil.nombre}</h1>
                <p className="text-white/80 flex items-center gap-2 mt-1">
                  <FaEnvelope size={14} />
                  {perfil.email}
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Info Card */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Información de la Cuenta</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <FaUser size={14} />
                    <span className="text-sm font-semibold">Nombre</span>
                  </div>
                  <p className="text-gray-800 font-medium">{perfil.nombre}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <FaEnvelope size={14} />
                    <span className="text-sm font-semibold">Email</span>
                  </div>
                  <p className="text-gray-800 font-medium">{perfil.email}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <FaShieldAlt size={14} />
                    <span className="text-sm font-semibold">Rol</span>
                  </div>
                  <p className="text-gray-800 font-medium">
                    {perfil.is_admin ? "Administrador" : "Usuario"}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <FaHeart size={14} />
                    <span className="text-sm font-semibold">Favoritos</span>
                  </div>
                  <p className="text-gray-800 font-medium">{favoritos.length} gasolineras</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-xl font-semibold hover:bg-gray-700 transition-all"
              >
                <FaSignOutAlt />
                Cerrar Sesión
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all"
              >
                <FaTrash />
                Eliminar Cuenta
              </button>
            </div>
          </div>
        </div>

        {/* Favoritos */}
        <div className="bg-white shadow-xl rounded-3xl overflow-hidden">
          <div className="bg-linear-to-r from-[#000C74] to-[#4A52D9] p-6 text-white">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FaHeart />
              Mis Favoritos
            </h2>
          </div>
          <div className="p-8">
            {favoritos.length === 0 ? (
              <div className="text-center py-12">
                <FaHeart className="mx-auto text-gray-300 mb-4" size={48} />
                <p className="text-gray-500">No tienes favoritos guardados todavía.</p>
                <p className="text-sm text-gray-400 mt-2">Explora gasolineras y guarda tus favoritas</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {favoritos.map((fav) => (
                  <div
                    key={fav.ideess}
                    className="bg-gray-50 p-4 rounded-xl hover:bg-gray-100 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-800">ID: {fav.ideess}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Guardado: {new Date(fav.created_at).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                      <FaHeart className="text-red-500" size={20} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
