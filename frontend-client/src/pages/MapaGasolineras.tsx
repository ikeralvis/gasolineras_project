import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useNavigate } from "react-router-dom";
import { LuX, LuMapPin, LuNavigation, LuExternalLink, LuClock } from "react-icons/lu";
import { MdLocalGasStation } from "react-icons/md";
import { fetchGasMarkers, type GasMarker } from "../api/gasolineras";
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

const API_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

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

function normalizeStation<T extends Record<string, unknown>>(station: T): T & {
  [key: string]: unknown;
} {
  const rotulo = (station["Rótulo"] as string | undefined) ?? (station.Rotulo as string | undefined) ?? "";
  const direccion = (station["Dirección"] as string | undefined) ?? (station.Direccion as string | undefined);
  const direccionFields = direccion === undefined
    ? {}
    : { "Dirección": direccion, Direccion: direccion };
  return {
    ...station,
    "Rótulo": rotulo,
    Rotulo: rotulo,
    ...direccionFields,
  };
}

interface GasClusterMarker {
  type: "cluster";
  latitude: number;
  longitude: number;
  count: number;
  min_precio_95_e5?: string;
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
function createIcon(imageUrl?: string | null) {
  if (!imageUrl) {
    return L.divIcon({
      html: `<div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:#0F766E;border-radius:50%;border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35)"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h12"/><path d="M5 22V6.5A2.5 2.5 0 0 1 7.5 4h6A2.5 2.5 0 0 1 16 6.5V22"/><path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V14"/></svg></div>`,
      className: "",
      iconSize: [42, 42],
      iconAnchor: [21, 42],
      popupAnchor: [0, -42],
    });
  }

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

function getBrandIcon(rotulo?: string): string | null {
  const name = (rotulo ?? "").toLowerCase();
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

function getBrandLogo(rotulo?: string): string | null {
  return getBrandIcon(rotulo);
}

// Componente para actualizar el centro del mapa
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

interface GasMapControllerProps {
  onMarkersUpdate: (markers: GasMarker[]) => void;
  onLoading: (loading: boolean) => void;
}

function GasMapController({ onMarkersUpdate, onLoading }: Readonly<GasMapControllerProps>) {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);

  const fetchMarkers = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    onLoading(true);
    try {
      const markers = await fetchGasMarkers({
        lat_ne: ne.lat,
        lon_ne: ne.lng,
        lat_sw: sw.lat,
        lon_sw: sw.lng,
        zoom: map.getZoom(),
      });
      onMarkersUpdate(markers);
    } catch (err) {
      console.error("Gas markers fetch error:", err);
      onMarkersUpdate([]);
    } finally {
      onLoading(false);
    }
  }, [map, onMarkersUpdate, onLoading]);

  useEffect(() => {
    map.whenReady(() => {
      fetchMarkers();
      setTimeout(() => fetchMarkers(), 220);
    });
  }, [fetchMarkers]);

  useMapEvents({
    moveend: () => {
      fetchMarkers();
    },
  });

  return null;
}

function createClusterDivIcon(count: number): L.DivIcon {
  const size = Math.min(34 + Math.log2(count + 1) * 5, 58);
  const label = count > 999 ? "999+" : String(count);
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:#0F766E;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer">${label}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface ClusterCircleProps {
  marker: GasClusterMarker;
}

function ClusterCircle({ marker }: Readonly<ClusterCircleProps>) {
  const map = useMap();
  const icon = useMemo(() => createClusterDivIcon(marker.count), [marker.count]);

  return (
    <Marker
      position={[marker.latitude, marker.longitude]}
      icon={icon}
      eventHandlers={{
        click: () => map.flyTo([marker.latitude, marker.longitude], Math.min(map.getZoom() + 2, 18)),
      }}
    />
  );
}

interface GasolineraDrawerProps {
  ideess: string | null;
  onClose: () => void;
}

const MOBILE_SNAP_POINTS = [42, 68, 90] as const;

function GasolineraDrawer({ ideess, onClose }: Readonly<GasolineraDrawerProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<GasolineraDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapIndex, setSnapIndex] = useState<number>(1);
  const dragStartY = useRef<number | null>(null);

  const startHandleDrag = (startY: number) => {
    dragStartY.current = startY;
  };

  const endHandleDrag = (endY: number) => {
    if (dragStartY.current === null) {
      return;
    }
    const delta = endY - dragStartY.current;
    if (delta < -45) {
      setSnapIndex((prev) => Math.min(prev + 1, MOBILE_SNAP_POINTS.length - 1));
    } else if (delta > 45) {
      setSnapIndex((prev) => Math.max(prev - 1, 0));
    }
    dragStartY.current = null;
  };

  useEffect(() => {
    if (!ideess) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(`${API_URL}/api/gasolineras/${ideess}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDetail(normalizeStation(d) as GasolineraDetail); })
      .catch(() => { if (!cancelled) setError(t("detail.loadingDetails")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ideess, t]);

  useEffect(() => {
    if (ideess) {
      setSnapIndex(1);
    }
  }, [ideess]);

  useEffect(() => {
    if (!ideess) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [ideess, onClose]);

  const isOpen = !!ideess;
  const logo = detail ? getBrandLogo(detail["Rótulo"]) : null;
  const snapHeight = `${MOBILE_SNAP_POINTS[snapIndex]}vh`;

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
          transition-all duration-300 ease-in-out
          rounded-t-2xl md:rounded-none
          ${isOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full"}
          flex flex-col max-h-(--sheet-h,80vh) md:max-h-full overflow-hidden
        `}
        style={{ ...(isOpen ? ({ "--sheet-h": snapHeight } as Record<string, string>) : {}) }}
      >
        {/* Handle movil */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0 touch-none">
          <button
            type="button"
            aria-label="Arrastra para expandir o colapsar"
            className="h-8 w-24 rounded-full flex items-center justify-center"
            onClick={() => setSnapIndex((prev) => (prev === MOBILE_SNAP_POINTS.length - 1 ? 0 : prev + 1))}
            onTouchStart={(event) => startHandleDrag(event.touches[0].clientY)}
            onTouchEnd={(event) => endHandleDrag(event.changedTouches[0].clientY)}
            onMouseDown={(event) => {
              startHandleDrag(event.clientY);
              const onMouseUp = (upEvent: MouseEvent) => {
                endHandleDrag(upEvent.clientY);
                globalThis.removeEventListener("mouseup", onMouseUp);
              };
              globalThis.addEventListener("mouseup", onMouseUp);
            }}
          >
            <span className="w-12 h-1.5 rounded-full bg-gray-300" />
          </button>
        </div>
        <p className="md:hidden text-center text-[11px] text-gray-400 pb-2">Toca o arrastra para ajustar</p>

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
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">G95</p>
                  <p className="text-lg font-bold text-gray-900">
                    {detail["Precio Gasolina 95 E5"] || "-"}
                    <span className="ml-1 text-xs font-medium text-gray-500">€/L</span>
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">GOA</p>
                  <p className="text-lg font-bold text-gray-900">
                    {detail["Precio Gasoleo A"] || "-"}
                    <span className="ml-1 text-xs font-medium text-gray-500">€/L</span>
                  </p>
                </div>
              </div>

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
              className="flex-1 min-h-11 flex items-center justify-center gap-2 py-2.5 bg-[#000C74] text-white rounded-xl hover:bg-[#001A8A] transition text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000C74] focus-visible:ring-offset-2"
            >
              <LuExternalLink size={15} />
              {t("common.viewDetails")}
            </button>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${detail.Latitud},${detail.Longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-[#000C74] text-[#000C74] rounded-xl hover:bg-[#F0F2FF] transition text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000C74] focus-visible:ring-offset-2"
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
  const [markers, setMarkers] = useState<GasMarker[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>([40.4168, -3.7038]);
  const [loading, setLoading] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserLocation([lat, lon]);
        setLocationGranted(true);
      },
      (error) => {
        console.warn("No se pudo obtener ubicacion:", error.message);
      },
      { timeout: 5000 }
    );
  }, []);

  const stationMarkers = markers.filter((m): m is { type: "station"; station: Gasolinera } => m.type === "station");
  const clusterMarkers = markers.filter((m): m is GasClusterMarker => m.type === "cluster");

  const getStatusMessage = () => {
    if (loading) return t("map.loadingLocation");
    if (clusterMarkers.length > 0) return `Mostrando ${clusterMarkers.length} clusters`;
    if (locationGranted) return t("map.nearbyStations", { count: stationMarkers.length });
    return t("map.showingStations", { count: stationMarkers.length });
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

      <MapContainer
        center={userLocation}
        zoom={locationGranted ? 13 : 6}
        className="flex-1 z-0"
        style={{ zIndex: 0 }}
      >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; <a href='https://carto.com/attributions'>CARTO</a>"
          />

          <MapUpdater center={userLocation} />

          <GasMapController
            onMarkersUpdate={setMarkers}
            onLoading={setLoading}
          />

          {locationGranted && (
            <Marker position={userLocation} icon={userLocationIcon}>
              <Popup>
                <div className="p-2 text-center">
                  <p className="font-semibold text-[#000C74]">{t("map.yourLocation")}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {clusterMarkers.map((cluster) => (
            <ClusterCircle
              key={`cluster-${cluster.latitude}-${cluster.longitude}-${cluster.count}`}
              marker={cluster}
            />
          ))}

          {stationMarkers.map((g) => (
            <Marker
              key={g.station.IDEESS}
              position={[g.station.Latitud, g.station.Longitud]}
              icon={createIcon(getBrandIcon(g.station["Rótulo"] ?? (g.station as any).Rotulo))}
              eventHandlers={{
                click: () => setSelectedId(g.station.IDEESS),
              }}
            />
          ))}
      </MapContainer>

      {loading && (
        <div className="absolute inset-0 z-500 flex items-center justify-center bg-white/55 backdrop-blur-[1px] pointer-events-none">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[#000C74] border-t-transparent mb-3" />
            <p className="text-gray-600 font-medium">{t("map.loadingMap")}</p>
          </div>
        </div>
      )}

      {/* Drawer de detalle */}
      <GasolineraDrawer
        ideess={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

