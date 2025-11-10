import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Gasolineras from "./pages/Gasolineras";
import GasolineraDetalle from "./components/GasolineraDetalle";
import MapaGasolineras from "./pages/MapaGasolineras";

function App() {
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
