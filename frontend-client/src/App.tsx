import { useEffect } from "react";
import type { ReactElement } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Navbar from "./components/Navbar";
import Gasolineras from "./pages/Gasolineras";
import GasolineraDetalle from "./components/GasolineraDetalle";
import MapaGasolineras from "./pages/MapaGasolineras";
import MapaRecarga from "./pages/MapaRecarga";
import Rutas from "./pages/Rutas";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Favoritos from "./pages/Favoritos";

function RequireAuth({ children }: Readonly<{ children: ReactElement }>) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";

  return (
    <>
      {!isAuthPage && <Navbar />}
      <main id="main-content" className={isAuthPage ? "" : "pb-24 md:pb-0"}>
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/gasolineras" replace /> : <Home />} />
          <Route path="/login" element={isAuthenticated ? <Navigate to="/gasolineras" replace /> : <Login />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/gasolineras" replace /> : <Register />} />

          <Route path="/gasolineras" element={<RequireAuth><Gasolineras /></RequireAuth>} />
          <Route path="/gasolinera/:id" element={<RequireAuth><GasolineraDetalle /></RequireAuth>} />
          <Route path="/mapa" element={<RequireAuth><MapaGasolineras /></RequireAuth>} />
          <Route path="/recarga" element={<RequireAuth><MapaRecarga /></RequireAuth>} />
          <Route path="/rutas" element={<RequireAuth><Rutas /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/favoritos" element={<RequireAuth><Favoritos /></RequireAuth>} />

          <Route path="*" element={<Navigate to={isAuthenticated ? "/gasolineras" : "/"} replace />} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

  useEffect(() => {
    async function checkAndSync() {
      try {
         // Check count solo para diagnóstico en cliente.
        // La sincronización debe ejecutarse con un job interno (Cloud Scheduler/Cron), no desde frontend.
        const res = await fetch(`${API_BASE_URL}/api/gasolineras/count`);
        const data = await res.json();

        if (data.total === 0) {
          console.warn("⚠️ No hay gasolineras cargadas. Esperando sincronización interna.");
        }
      } catch (err) {
        console.error("Error comprobando gasolineras:", err);
      }
    }

    checkAndSync();
  }, [API_BASE_URL]);

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
