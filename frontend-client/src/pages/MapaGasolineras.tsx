import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";

import repsol from "../assets/logos/repsol.svg";
import cepsa from "../assets/logos/cepsa.jpg";
import bp from "../assets/logos/bp.png";
import shell from "../assets/logos/shell.png";
import galp from "../assets/logos/galp.png";
import eroski from "../assets/logos/eroski.svg";
import moeve from "../assets/logos/moeve.png";

interface Gasolinera {
  IDEESS: string;
  Rótulo: string;
  Municipio: string;
  Provincia: string;
  Latitud: number;
  Longitud: number;
  ["Precio Gasolina 95 E5"]: string;
  ["Precio Gasoleo A"]: string;
}

function createIcon(imageUrl: string) {
  return new L.Icon({
    iconUrl: imageUrl,
    iconSize: [44, 44],
    iconAnchor: [19, 38],
    popupAnchor: [0, -28],
    className: "transition-transform"

  });
}

function getBrandIcon(rotulo: string) {
  const name = rotulo.toLowerCase();
  if (name.includes("repsol")) return repsol;
  if (name.includes("cepsa")) return cepsa;
  if (name.includes("bp")) return bp;
  if (name.includes("shell")) return shell;
  if (name.includes("galp")) return galp;
  if (name.includes("eroski")) return eroski;
  if (name.includes("moeve")) return moeve;
  return "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
}

export default function MapaGasolineras() {
  const [gasolineras, setGasolineras] = useState<Gasolinera[]>([]);

  useEffect(() => {
    fetch("http://localhost:8080/api/gasolineras")
      .then((res) => res.json())
      .then((data) => setGasolineras(data.gasolineras || data))
      .catch((err) => console.error("Error cargando gasolineras:", err));
  }, []);

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col">
      
      {/* ENCABEZADO MAPA */}
      <div className="p-4 bg-[#000C74] text-white shadow z-10">
        <h2 className="text-lg font-semibold">Mapa de Gasolineras</h2>
        <p className="text-white/80 text-sm">Explora las estaciones cerca de ti.</p>
      </div>

      <MapContainer
        center={[40.4168, -3.7038]}
        zoom={6}
        className="flex-1"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />

        {gasolineras.map((g) => (
          <Marker
            key={g.IDEESS}
            position={[g.Latitud, g.Longitud]}
            icon={createIcon(getBrandIcon(g["Rótulo"]))}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-[#000C74] text-base">
                  {g["Rótulo"]}
                </h3>
                <p className="text-gray-600 text-sm">{g.Municipio}, {g.Provincia}</p>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="p-2 rounded-lg bg-gray-100 text-center">
                    <span className="block text-gray-500">Gasolina 95</span>
                    <span className="font-medium">{g["Precio Gasolina 95 E5"]} €</span>
                  </div>

                  <div className="p-2 rounded-lg bg-gray-100 text-center">
                    <span className="block text-gray-500">Gasóleo A</span>
                    <span className="font-medium">{g["Precio Gasoleo A"]} €</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
