import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Gasolineras from "./pages/Gasolineras";
import GasolineraDetalle from "./components/GasolineraDetalle";
import MapaGasolineras from "./pages/MapaGasolineras";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Favoritos from "./pages/Favoritos";

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

  useEffect(() => {
    async function checkAndSync() {
      try {
        // 1. Check count
        const res = await fetch(`${API_BASE_URL}/api/gasolineras/count`);
        const data = await res.json();

        // 2. If database is empty → sync
        if (data.total === 0) {
          console.log("⚠️ No hay gasolineras. Sincronizando datos...");
          await fetch(`${API_BASE_URL}/api/gasolineras/sync`, { method: "POST" });
          console.log("✅ Sincronización completada.");

          // Opcional: recargar para actualizar automáticamente la tabla
          globalThis.location.reload();
        }
      } catch (err) {
        console.error("Error comprobando gasolineras:", err);
      }
    }

    checkAndSync();
  }, [API_BASE_URL]);

  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gasolineras" element={<Gasolineras />} />
        <Route path="/gasolinera/:id" element={<GasolineraDetalle />} />
        <Route path="/mapa" element={<MapaGasolineras />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/favoritos" element={<Favoritos />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
