import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

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
    if (!window.confirm("¿Seguro que quieres eliminar tu cuenta? Esta acción es irreversible.")) return;
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
  if (loading) return <div className="profile-loading">Cargando perfil...</div>;
  if (error) return <div className="profile-error">{error}</div>;
  if (!perfil) return <div className="profile-error">No se pudo cargar el perfil.</div>;

  return (
    <div className="profile-container">
      <h2>Mi Perfil</h2>
      <div className="profile-info">
        <p><strong>Nombre:</strong> {perfil.nombre}</p>
        <p><strong>Email:</strong> {perfil.email}</p>
        <p><strong>Rol:</strong> {perfil.is_admin ? "Administrador" : "Usuario"}</p>
      </div>
      <button className="profile-logout" onClick={handleLogout}>Cerrar sesión</button>
      <button className="profile-delete" onClick={handleDelete}>Eliminar cuenta</button>
      <h3>Mis Favoritos</h3>
      {favoritos.length === 0 ? (
        <p>No tienes favoritos guardados.</p>
      ) : (
        <ul className="profile-favs">
          {favoritos.map((fav) => (
            <li key={fav.ideess}>
              <span>{fav.ideess}</span>
              <span style={{ fontSize: "0.8em", color: "#888" }}>{new Date(fav.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
