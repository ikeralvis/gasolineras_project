import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Gasolineras from "./pages/Gasolineras";
import GasolineraDetalle from "./components/GasolineraDetalle";
import MapaGasolineras from "./pages/MapaGasolineras";

function App() {

  useEffect(() => {
    async function checkAndSync() {
      try {
        // 1. Check count
        const res = await fetch("http://localhost:8080/api/gasolineras/count");
        const data = await res.json();

        // 2. If database is empty → sync
        if (data.total === 0) {
          console.log("⚠️ No hay gasolineras. Sincronizando datos...");
          await fetch("http://localhost:8080/api/gasolineras/sync", { method: "POST" });
          console.log("✅ Sincronización completada.");

          // Opcional: recargar para actualizar automáticamente la tabla
          window.location.reload();
        }
      } catch (err) {
        console.error("Error comprobando gasolineras:", err);
      }
    }

    checkAndSync();
  }, []);




  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gasolineras" element={<Gasolineras />} />
        <Route path="/gasolinera/:id" element={<GasolineraDetalle />} />
        <Route path="/mapa" element={<MapaGasolineras />} />
      </Routes>
    </>
  );
}

export default App;
