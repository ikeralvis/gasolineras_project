import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import HistorialPrecios from "./HistorialPrecios";
import FavoritoButton from "./FavoritoButton";

// Importar logos
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
  Dirección?: string;
  Latitud: number;
  Longitud: number;
  ["Precio Gasolina 95 E5"]: string;
  ["Precio Gasolina 98 E5"]?: string;
  ["Precio Gasoleo A"]: string;
  ["Precio Gasoleo B"]?: string;
  ["Precio Gasoleo Premium"]?: string;
  Horario?: string;
  distancia?: number;
}

// Función para obtener logo
const getBrandLogo = (rotulo: string): string | null => {
  const name = rotulo.toLowerCase();
  if (name.includes("repsol")) return repsol;
  if (name.includes("cepsa")) return cepsa;
  if (name.includes("bp")) return bp;
  if (name.includes("shell")) return shell;
  if (name.includes("galp")) return galp;
  if (name.includes("eroski")) return eroski;
  if (name.includes("moeve")) return moeve;
  return null;
};

// Función para determinar si un precio es bajo
const esPrecioBajo = (precio: string, tipo: "gasolina" | "diesel"): boolean => {
  const precioNum = Number.parseFloat(precio.replace(",", "."));
  if (Number.isNaN(precioNum) || precioNum === 0) return false;
  const umbral = tipo === "gasolina" ? 1.5 : 1.4;
  return precioNum < umbral;
};

export default function GasolineraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [gasolinera, setGasolinera] = useState<Gasolinera | null>(null);
  const [cercanas, setCercanas] = useState<Gasolinera[]>([]);
  const [ordenCercanas, setOrdenCercanas] = useState<"distancia" | "precio">("distancia");

  useEffect(() => {
    fetch(`http://localhost:8080/api/gasolineras/${id}`)
      .then(res => res.json())
      .then(data => setGasolinera(data))
      .catch(err => console.error(err));

    fetch(`http://localhost:8080/api/gasolineras/${id}/cercanas`)
      .then(res => res.json())
      .then(data => setCercanas(data.gasolineras_cercanas ?? []))
      .catch(err => console.error(err));
  }, [id]);

  if (!gasolinera) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#000C74] border-t-transparent mb-4"></div>
          <p className="text-gray-600 font-medium">Cargando detalles...</p>
        </div>
      </div>
    );
  }

  const logo = getBrandLogo(gasolinera["Rótulo"]);

  // Preparar lista de combustibles
  const combustibles = [
    { nombre: "Gasolina 95 E5", precio: gasolinera["Precio Gasolina 95 E5"], tipo: "gasolina" as const },
    { nombre: "Gasolina 98 E5", precio: gasolinera["Precio Gasolina 98 E5"], tipo: "gasolina" as const },
    { nombre: "Gasóleo A", precio: gasolinera["Precio Gasoleo A"], tipo: "diesel" as const },
    { nombre: "Gasóleo B", precio: gasolinera["Precio Gasoleo B"], tipo: "diesel" as const },
    { nombre: "Gasóleo Premium", precio: gasolinera["Precio Gasoleo Premium"], tipo: "diesel" as const },
  ].filter(c => c.precio && c.precio.trim() !== "" && Number.parseFloat(c.precio.replace(",", ".")) > 0);

  // Ordenar cercanas
  const cercanasOrdenadas = [...cercanas].sort((a, b) => {
    if (ordenCercanas === "distancia") {
      return (a.distancia ?? 0) - (b.distancia ?? 0);
    }
    const precioA = Number.parseFloat(a["Precio Gasolina 95 E5"].replace(",", "."));
    const precioB = Number.parseFloat(b["Precio Gasolina 95 E5"].replace(",", "."));
    return precioA - precioB;
  });

  const icon = new L.Icon({
    iconUrl: logo || "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -44]
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* HEADER CON BOTÓN VOLVER */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#000C74] hover:text-[#0A128C] font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>

        {/* CARD PRINCIPAL CON LOGO */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {logo ? (
                <img 
                  src={logo} 
                  alt={gasolinera["Rótulo"]} 
                  className="w-16 h-16 object-contain rounded-xl bg-white shadow-md p-2"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-linear-to-br from-[#000C74] to-[#4A52D9] flex items-center justify-center text-white font-bold text-xl shadow-md">
                  {gasolinera["Rótulo"].substring(0, 2).toUpperCase()}
                </div>
              )}
              
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {gasolinera["Rótulo"]}
                </h1>
                <div className="flex items-center gap-2 mt-2 text-gray-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span>{gasolinera.Municipio}, {gasolinera.Provincia}</span>
                </div>
                {gasolinera.Dirección && (
                  <p className="text-sm text-gray-500 mt-1">{gasolinera.Dirección}</p>
                )}
              </div>
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div className="flex gap-3 items-center">
              <FavoritoButton ideess={gasolinera.IDEESS} size="lg" showLabel />
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${gasolinera.Latitud},${gasolinera.Longitud}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#000C74] text-white rounded-xl hover:bg-[#0A128C] transition shadow-md font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Cómo llegar
              </a>
              
              <button
                className="px-4 py-2 bg-white border-2 border-[#000C74] text-[#000C74] rounded-xl hover:bg-[#F8F9FF] transition shadow-md font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Compartir
              </button>
            </div>
          </div>

          {/* PRECIOS DE COMBUSTIBLES */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Precios de Combustible</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {combustibles.map((combustible) => (
                <div 
                  key={combustible.nombre}
                  className="relative rounded-xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-600">{combustible.nombre}</span>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          {combustible.precio}
                        </span>
                        <span className="text-sm text-gray-500">€/L</span>
                      </div>
                    </div>
                    {combustible.precio && esPrecioBajo(combustible.precio, combustible.tipo) && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                        ¡PRECIO BAJO!
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MAPA MEJORADO */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-4 bg-linear-to-r from-[#000C74] to-[#4A52D9] text-white">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Ubicación
            </h2>
            <p className="text-white/80 text-sm mt-1">
              {gasolinera.Latitud.toFixed(6)}, {gasolinera.Longitud.toFixed(6)}
            </p>
          </div>
          
          <MapContainer
            center={[gasolinera.Latitud, gasolinera.Longitud]}
            zoom={16}
            className="h-96 w-full z-0"
            style={{ zIndex: 0 }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[gasolinera.Latitud, gasolinera.Longitud]} icon={icon}>
              <Popup>
                <div className="p-2">
                  <p className="font-semibold">{gasolinera["Rótulo"]}</p>
                  <p className="text-sm text-gray-600">{gasolinera.Municipio}</p>
                </div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>

        {/* HISTORIAL DE PRECIOS */}
        <HistorialPrecios ideess={gasolinera.IDEESS} />

        {/* GASOLINERAS CERCANAS MEJORADAS */}
        {cercanas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-[#000C74]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Gasolineras cercanas ({cercanas.length})
              </h2>
              
              {/* SELECTOR DE ORDEN */}
              <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setOrdenCercanas("distancia")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    ordenCercanas === "distancia"
                      ? "bg-white text-[#000C74] shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Por distancia
                </button>
                <button
                  onClick={() => setOrdenCercanas("precio")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    ordenCercanas === "precio"
                      ? "bg-white text-[#000C74] shadow"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Por precio
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              {cercanasOrdenadas.slice(0, 5).map((g, index) => {
                const logoC = getBrandLogo(g["Rótulo"]);
                const distanciaKm = g.distancia ? (g.distancia / 1000).toFixed(1) : null;
                
                return (
                  <button
                    key={g.IDEESS}
                    onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
                    className="p-5 bg-linear-to-r from-gray-50 to-white border-2 border-gray-200 rounded-xl hover:border-[#000C74] hover:shadow-lg transition-all text-left group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        {/* NÚMERO */}
                        <div className="w-8 h-8 rounded-full bg-[#000C74] text-white flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        
                        {/* LOGO */}
                        {logoC ? (
                          <img 
                            src={logoC} 
                            alt={g["Rótulo"]} 
                            className="w-10 h-10 object-contain rounded-lg bg-white shadow-sm p-1"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-[#000C74] to-[#4A52D9] flex items-center justify-center text-white font-bold text-xs">
                            {g["Rótulo"].substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        
                        {/* INFO */}
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 group-hover:text-[#000C74] transition">
                            {g["Rótulo"]}
                          </p>
                          <p className="text-sm text-gray-600">{g.Municipio}</p>
                          {distanciaKm && (
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                              </svg>
                              {distanciaKm} km
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* PRECIOS */}
                      <div className="flex gap-3">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">G95</p>
                          <p className="text-lg font-bold text-gray-900">
                            {g["Precio Gasolina 95 E5"]}€
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Diesel</p>
                          <p className="text-lg font-bold text-gray-900">
                            {g["Precio Gasoleo A"]}€
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
