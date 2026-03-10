import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import HistorialPrecios from "./HistorialPrecios";
import FavoritoButton from "./FavoritoButton";
import HorarioDisplay, { type HorarioParsed } from "./HorarioDisplay";

// API URL
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

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
  horario_parsed?: HorarioParsed;
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
  const { t } = useTranslation();

  const [gasolinera, setGasolinera] = useState<Gasolinera | null>(null);
  const [cercanas, setCercanas] = useState<Gasolinera[]>([]);
  const [ordenCercanas, setOrdenCercanas] = useState<"distancia" | "precio">("distancia");

  useEffect(() => {
    fetch(`${API_URL}/api/gasolineras/${id}`)
      .then(res => res.json())
      .then(data => setGasolinera(data))
      .catch(err => console.error(err));

    fetch(`${API_URL}/api/gasolineras/${id}/cercanas`)
      .then(res => res.json())
      .then(data => setCercanas(data.gasolineras_cercanas ?? []))
      .catch(err => console.error(err));
  }, [id]);

  if (!gasolinera) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#000C74] border-t-transparent mb-4"></div>
          <p className="text-gray-600 font-medium">{t('detail.loadingDetails')}</p>
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

  const iconUrl = logo || "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
  const icon = L.divIcon({
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center"><img src="${iconUrl}" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));" /></div>`,
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -44],
  });

  return (
    <div className="min-h-screen bg-white pb-16 sm:pb-12">
      <div className="max-w-4xl mx-auto px-4 py-5 sm:py-8 space-y-4 sm:space-y-6">

        {/* HEADER CON BOTÓN VOLVER */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#000C74] transition-colors font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('detail.back')}
        </button>

        {/* CARD PRINCIPAL CON LOGO */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
          {/* Logo + Nombre + Acciones */}
          <div className="flex items-start gap-3 sm:gap-4">
            {logo ? (
              <img
                src={logo}
                alt={gasolinera["Rótulo"]}
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
              />
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#000C74] flex items-center justify-center text-white font-bold text-xl shrink-0">
                {gasolinera["Rótulo"].substring(0, 2).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                {gasolinera["Rótulo"]}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {gasolinera.Municipio}, {gasolinera.Provincia}
              </p>
              {gasolinera.Dirección && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{gasolinera.Dirección}</p>
              )}
            </div>

            <div className="shrink-0">
              <FavoritoButton ideess={gasolinera.IDEESS} size="lg" showLabel />
            </div>
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="flex flex-wrap gap-2 mt-4">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${gasolinera.Latitud},${gasolinera.Longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#000C74] text-white rounded-xl hover:bg-[#0A128C] transition text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              {t('detail.howToGet')}
            </a>

            <button className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition text-sm font-medium text-gray-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {t('detail.share')}
            </button>
          </div>

          {/* PRECIOS DE COMBUSTIBLES */}
          <div className="mt-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail.fuelPrices')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {combustibles.map((combustible) => (
                <div
                  key={combustible.nombre}
                  className="relative rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4"
                >
                  <span className="text-xs text-gray-500 font-medium leading-tight block">{combustible.nombre}</span>
                  <div className="mt-1.5 flex items-baseline gap-0.5">
                    <span className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {combustible.precio}
                    </span>
                    <span className="text-xs text-gray-400 mb-0.5">€/L</span>
                  </div>
                  {combustible.precio && esPrecioBajo(combustible.precio, combustible.tipo) && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" title={t('detail.lowPrice')} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* HORARIO */}
        {(gasolinera.Horario || gasolinera.horario_parsed) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('detail.schedule')}
            </h2>
            <HorarioDisplay
              mode="full"
              horario={gasolinera.Horario}
              horario_parsed={gasolinera.horario_parsed}
            />
          </div>
        )}

        {/* MAPA */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              {t('detail.location')}
            </h2>
            <span className="text-xs text-gray-400 font-mono">
              {gasolinera.Latitud.toFixed(5)}, {gasolinera.Longitud.toFixed(5)}
            </span>
          </div>

          <MapContainer
            center={[gasolinera.Latitud, gasolinera.Longitud]}
            zoom={16}
            className="h-56 sm:h-80 w-full z-0"
            style={{ zIndex: 0 }}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
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

        {/* GASOLINERAS CERCANAS */}
        {cercanas.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {t('detail.nearbyStations', { count: cercanas.length })}
              </h2>

              {/* SELECTOR DE ORDEN */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setOrdenCercanas("distancia")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    ordenCercanas === "distancia"
                      ? "bg-white text-[#000C74] shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t('detail.sortByDistance')}
                </button>
                <button
                  onClick={() => setOrdenCercanas("precio")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    ordenCercanas === "precio"
                      ? "bg-white text-[#000C74] shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t('detail.sortByPrice')}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {cercanasOrdenadas.slice(0, 5).map((g, index) => {
                const logoC = getBrandLogo(g["Rótulo"]);
                const distanciaKm = g.distancia ? (g.distancia / 1000).toFixed(1) : null;

                return (
                  <button
                    key={g.IDEESS}
                    onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
                    className="w-full flex items-center gap-3 py-3 hover:bg-gray-50/70 transition-colors text-left rounded-xl px-2 -mx-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#000C74]/10 text-[#000C74] flex items-center justify-center text-[10px] font-bold shrink-0">
                      {index + 1}
                    </span>
                    {logoC ? (
                      <img src={logoC} alt="" className="w-9 h-9 object-contain shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-[#000C74] flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {g["Rótulo"].substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{g["Rótulo"]}</p>
                      <p className="text-xs text-gray-500">
                        {g.Municipio}{distanciaKm ? ` · ${distanciaKm} km` : ""}
                      </p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">G95</p>
                        <p className="text-sm font-bold text-gray-900">{g["Precio Gasolina 95 E5"]}€</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">GOA</p>
                        <p className="text-sm font-bold text-gray-900">{g["Precio Gasoleo A"]}€</p>
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
