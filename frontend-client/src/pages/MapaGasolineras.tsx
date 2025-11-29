import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import { getGasolinerasCerca } from "../api/gasolineras";

import repsol from "../assets/logos/repsol.svg";
import cepsa from "../assets/logos/cepsa.jpg";
import bp from "../assets/logos/bp.png";
import shell from "../assets/logos/shell.png";
import galp from "../assets/logos/galp.png";
import eroski from "../assets/logos/eroski.svg";
import moeve from "../assets/logos/moeve.png";
import petronor from "../assets/logos/petronor.png";
import costco from "../assets/logos/costco.png";
import easygas from "../assets/logos/easygas.png";
import petroprix from "../assets/logos/petroprix.png";

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
  if (name.includes("petronor")) return petronor;
  if (name.includes("costco")) return costco;
  if (name.includes("easygas")) return easygas;
  if (name.includes("petroprix")) return petroprix;
  return "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
}

// Componente para actualizar el centro del mapa
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  
  return null;
}

export default function MapaGasolineras() {
  const [gasolineras, setGasolineras] = useState<Gasolinera[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>([40.4168, -3.7038]); // Madrid por defecto
  const [loading, setLoading] = useState(true);
  const [locationGranted, setLocationGranted] = useState(false);

  useEffect(() => {
    async function cargarGasolineras() {
      try {
        setLoading(true);

        // Pedir ubicación del usuario
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            
            console.log("📍 Ubicación del usuario:", lat, lon);
            setUserLocation([lat, lon]);
            setLocationGranted(true);

            // Cargar gasolineras cercanas (50km)
            const cerca = await getGasolinerasCerca(lat, lon, 50);
            console.log("✅ Gasolineras cercanas cargadas:", cerca.length);
            setGasolineras(cerca);
            setLoading(false);
          },
          async (error) => {
            console.warn("⚠️ No se pudo obtener ubicación:", error.message);
            
            // Si no se concede ubicación, cargar todas (fallback)
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api/gasolineras?limit=500`);
            const data = await res.json();
            setGasolineras(data.gasolineras || []);
            setLoading(false);
          },
          { timeout: 5000 }
        );
      } catch (error) {
        console.error("❌ Error cargando gasolineras:", error);
        setLoading(false);
      }
    }

    cargarGasolineras();
  }, []);

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col">
      
      {/* ENCABEZADO MAPA */}
      <div className="p-4 bg-[#000C74] text-white shadow z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Mapa de Gasolineras</h2>
            <p className="text-white/80 text-sm">
              {loading 
                ? "Cargando ubicación..." 
                : locationGranted 
                  ? `${gasolineras.length} gasolineras cerca de ti` 
                  : `Mostrando ${gasolineras.length} gasolineras`
              }
            </p>
          </div>
          
          {locationGranted && (
            <div className="flex items-center gap-2 bg-green-500/20 px-3 py-2 rounded-lg border border-green-400">
              <svg className="w-5 h-5 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-green-300">Ubicación detectada</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#000C74] border-t-transparent mb-4"></div>
            <p className="text-gray-600 font-medium">Cargando mapa...</p>
          </div>
        </div>
      ) : (
        <MapContainer
          center={userLocation}
          zoom={13}
          className="flex-1 z-0"
          style={{ zIndex: 0 }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          
          <MapUpdater center={userLocation} />

          {/* Marcador de ubicación del usuario */}
          {locationGranted && (
            <Marker
              position={userLocation}
              icon={new L.Icon({
                iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
                shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })}
            >
              <Popup>
                <div className="p-2 text-center">
                  <p className="font-semibold text-[#000C74]">📍 Tu ubicación</p>
                </div>
              </Popup>
            </Marker>
          )}

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
      )}
    </div>
  );
}
