import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useNavigate } from "react-router-dom";
import { LuX, LuMapPin, LuNavigation, LuExternalLink, LuClock } from "react-icons/lu";
import { MdLocalGasStation } from "react-icons/md";
import { getGasolinerasCerca } from "../api/gasolineras";
import HorarioDisplay, { type HorarioParsed } from "../components/HorarioDisplay";

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

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

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

interface GasolineraDetail extends Gasolinera {
  Dirección?: string;
  ["Precio Gasolina 98 E5"]?: string;
  ["Precio Gasoleo B"]?: string;
  ["Precio Gasoleo Premium"]?: string;
  Horario?: string;
  horario_parsed?: HorarioParsed;
}

// Crear icono transparente con drop-shadow
function createIcon(imageUrl: string) {
  return L.divIcon({
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center"><img src="${imageUrl}" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));" /></div>`,
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -44],
  });
}

// Icono circular para la ubicaciÃ³n del usuario (estilo Google Maps)
const userLocationIcon = L.divIcon({
  html: `
    <div class="user-location-dot">
      <div class="user-location-pulse"></div>
      <div class="user-location-center"></div>
    </div>
  `,
  className: 'user-location-marker',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

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

function getBrandLogo(rotulo: string): string | null {
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
  return null;
}

// Componente para actualizar el centro del mapa
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

// â”€â”€ Drawer de detalle de gasolinera â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface GasolineraDrawerProps {
  ideess: string | null;
  onClose: () => void;
}

function GasolineraDrawer({ ideess, onClose }: Readonly<GasolineraDrawerProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<GasolineraDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ideess) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(`${API_URL}/api/gasolineras/${ideess}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setError(t("detail.loadingDetails")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ideess, t]);

  const isOpen = !!ideess;
  const logo = detail ? getBrandLogo(detail["Rótulo"]) : null;

  const combustibles = detail ? [
    { label: "G95", nombre: "Gasolina 95 E5", precio: detail["Precio Gasolina 95 E5"] },
    { label: "G98", nombre: "Gasolina 98 E5", precio: detail["Precio Gasolina 98 E5"] },
    { label: "GOA", nombre: "Gasóleo A", precio: detail["Precio Gasoleo A"] },
    { label: "GOP", nombre: "Gasóleo Premium", precio: detail["Precio Gasoleo Premium"] },
  ].filter(c => c.precio && c.precio.trim() !== "" && Number.parseFloat(c.precio.replace(",", ".")) > 0) : [];

  return (
    <>
      {/* Backdrop móvil */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/30 z-900 md:hidden w-full cursor-default"
          aria-label="Cerrar"
          onClick={onClose}
        />
      )}

      {/* Panel drawer */}
      <div
        className={`
          fixed bottom-0 left-0 right-0
          md:bottom-auto md:top-0 md:right-0 md:left-auto
          md:h-full md:w-96
          bg-white shadow-2xl z-1000
          transition-transform duration-300 ease-in-out
          rounded-t-2xl md:rounded-none
          ${isOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full"}
          flex flex-col max-h-[80vh] md:max-h-full overflow-hidden
        `}
      >
        {/* Handle mÃ³vil */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {logo ? (
              <img src={logo} alt="" className="w-10 h-10 object-contain shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[#000C74] flex items-center justify-center text-white font-bold text-sm shrink-0">
                <MdLocalGasStation size={20} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-semibold text-[#000C74] text-base leading-tight truncate">
                {detail?.["Rótulo"] ?? t("map.title")}
              </h2>
              {detail && (
                <p className="text-xs text-gray-500 truncate">{detail.Municipio}, {detail.Provincia}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition shrink-0 ml-2"
            aria-label={t("common.close")}
          >
            <LuX className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#000C74] border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="text-center text-red-500 text-sm py-8">{error}</div>
          )}

          {detail && !loading && (
            <>
              {/* Dirección */}
              {detail.Dirección && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <LuMapPin className="text-gray-400 mt-0.5 shrink-0" size={15} />
                  <span>{detail.Dirección}</span>
                </div>
              )}

              {/* Precios */}
              {combustibles.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {t("detail.fuelPrices")}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {combustibles.map(c => (
                      <div key={c.label} className="bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-0.5">{c.nombre}</p>
                        <p className="text-xl font-bold text-gray-900 leading-tight">
                          {c.precio}
                          <span className="text-xs font-normal text-gray-500 ml-1">€/L</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Horario */}
              {(detail.Horario || detail.horario_parsed) && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <LuClock size={13} />
                    {t("detail.schedule")}
                  </h3>
                  <HorarioDisplay
                    mode="compact"
                    horario={detail.Horario}
                    horario_parsed={detail.horario_parsed}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer con acciones */}
        {detail && !loading && (
          <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-2">
            <button
              onClick={() => navigate(`/gasolinera/${detail.IDEESS}`)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#000C74] text-white rounded-xl hover:bg-[#001A8A] transition text-sm font-medium"
            >
              <LuExternalLink size={15} />
              {t("common.viewDetails")}
            </button>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${detail.Latitud},${detail.Longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-[#000C74] text-[#000C74] rounded-xl hover:bg-[#F0F2FF] transition text-sm font-medium"
            >
              <LuNavigation size={15} />
              {t("detail.howToGet")}
            </a>
          </div>
        )}
      </div>
    </>
  );
}

export default function MapaGasolineras() {
  const { t } = useTranslation();
  const [gasolineras, setGasolineras] = useState<Gasolinera[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>([40.4168, -3.7038]);
  const [loading, setLoading] = useState(true);
  const [locationGranted, setLocationGranted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    async function cargarGasolineras() {
      try {
        setLoading(true);
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            setUserLocation([lat, lon]);
            setLocationGranted(true);
            const cerca = await getGasolinerasCerca(lat, lon, 50);
            setGasolineras(cerca);
            setLoading(false);
          },
          async (error) => {
            console.warn("âš ï¸ No se pudo obtener ubicaciÃ³n:", error.message);
            const res = await fetch(`${API_URL}/api/gasolineras?limit=500`);
            const data = await res.json();
            setGasolineras(data.gasolineras || []);
            setLoading(false);
          },
          { timeout: 5000 }
        );
      } catch (error) {
        console.error("âŒ Error cargando gasolineras:", error);
        setLoading(false);
      }
    }
    cargarGasolineras();
  }, []);

  const getStatusMessage = () => {
    if (loading) return t("map.loadingLocation");
    if (locationGranted) return t("map.nearbyStations", { count: gasolineras.length });
    return t("map.showingStations", { count: gasolineras.length });
  };

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col relative">

      {/* ENCABEZADO MAPA */}
      <div className="bg-[#000C74] text-white shadow z-10 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MdLocalGasStation size={20} /> {t("map.title")}
              </h2>
              <p className="text-white/70 text-xs mt-0.5">{getStatusMessage()}</p>
            </div>
            {locationGranted && (
              <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1.5 rounded-lg border border-green-400/50">
                <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium text-green-300">{t("map.locationDetected")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#000C74] border-t-transparent mb-4" />
            <p className="text-gray-600 font-medium">{t("map.loadingMap")}</p>
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
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; <a href='https://carto.com/attributions'>CARTO</a>"
          />

          <MapUpdater center={userLocation} />

          {locationGranted && (
            <Marker position={userLocation} icon={userLocationIcon}>
              <Popup>
                <div className="p-2 text-center">
                  <p className="font-semibold text-[#000C74]">ðŸ“ {t("map.yourLocation")}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {gasolineras.map((g) => (
            <Marker
              key={g.IDEESS}
              position={[g.Latitud, g.Longitud]}
              icon={createIcon(getBrandIcon(g["Rótulo"]))}
              eventHandlers={{
                click: () => setSelectedId(g.IDEESS),
              }}
            />
          ))}
        </MapContainer>
      )}

      {/* Drawer de detalle */}
      <GasolineraDrawer
        ideess={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

