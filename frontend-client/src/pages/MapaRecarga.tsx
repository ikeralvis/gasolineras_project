import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { LuZap, LuMapPin, LuClock, LuX, LuPhone, LuGlobe, LuInfo } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import {
  BoundingBoxTooLargeError,
  EVMarker,
  EVSEConnector,
  LocationDetail,
  fetchEVLocationDetail,
  fetchEVMarkers,
} from "../api/charging";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useIsCoarsePointer } from "../hooks/useIsCoarsePointer";

const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL
  ?? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION
  ?? '&copy; <a href="https://carto.com/attributions">CARTO</a>';

// ── Location marker helpers ──────────────────────────────────────────────────

function getLocationStatusColor(detail: LocationDetail): string {
  if (!detail.evses?.length) return "#9CA3AF";
  const hasAvailable = detail.evses.some((e) => e.status === "AVAILABLE");
  const allCharging = detail.evses.every((e) => e.status === "CHARGING");
  if (hasAvailable) return "#10B981"; // emerald-500
  if (allCharging) return "#F59E0B"; // amber-500
  return "#EF4444"; // red-500
}

function getMarkerStatusColor(status?: string): string {
  if (status === "AVAILABLE") return "#10B981"; // emerald-500
  if (status === "CHARGING") return "#F59E0B"; // amber-500
  return "#9CA3AF"; // gray-400
}

function createLocationDivIcon(statusColor: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:${statusColor};border-radius:50%;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4);cursor:pointer"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>`,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

const userLocationIcon = L.divIcon({
  html: `
    <div class="user-location-dot">
      <div class="user-location-pulse"></div>
      <div class="user-location-center"></div>
    </div>
  `,
  className: "user-location-marker",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

const SPAIN_BOUNDS: [[number, number], [number, number]] = [[35.7, -9.7], [43.9, 3.4]];
const MIN_ZOOM_FOR_EV_MARKERS = 8;

function MapUpdater({ center, enabled }: { center: [number, number]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    map.setView(center, 13, { animate: false });
  }, [center, enabled, map]);

  return null;
}

function DefaultSpainViewController({ enabled }: Readonly<{ enabled: boolean }>) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    map.fitBounds(SPAIN_BOUNDS, { padding: [24, 24] });
  }, [enabled, map]);

  return null;
}

// ── Sub-component: listens to map move/zoom and fetches markers ───────────────
interface MapControllerProps {
  onMarkersUpdate: (markers: EVMarker[]) => void;
  onZoomTooLow: (show: boolean) => void;
  onBboxTooLarge: (requiredZoom: number | null) => void;
  onLoading: (loading: boolean) => void;
  refreshKey: string;
}

function EVMapController({
  onMarkersUpdate,
  onZoomTooLow,
  onBboxTooLarge,
  onLoading,
  refreshKey,
}: MapControllerProps) {
  const map = useMap();
  const fetchSeqRef = useRef(0);

  const fetchMarkers = useCallback(async () => {
    const currentSeq = ++fetchSeqRef.current;
    const zoom = map.getZoom();

    if (zoom < MIN_ZOOM_FOR_EV_MARKERS) {
      onZoomTooLow(true);
      onBboxTooLarge(null);
      onMarkersUpdate([]);
      onLoading(false);
      return;
    }

    onZoomTooLow(false);

    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    onLoading(true);
    try {
      const markers = await fetchEVMarkers({
        lat_ne: ne.lat,
        lon_ne: ne.lng,
        lat_sw: sw.lat,
        lon_sw: sw.lng,
        zoom,
      });
      if (currentSeq === fetchSeqRef.current) {
        onMarkersUpdate(markers);
        onBboxTooLarge(null);
      }
    } catch (err) {
      if (err instanceof BoundingBoxTooLargeError) {
        if (currentSeq === fetchSeqRef.current) {
          onBboxTooLarge(err.requiredZoom);
          onMarkersUpdate([]);
        }
      } else {
        console.error("EV markers fetch error:", err);
      }
    } finally {
      if (currentSeq === fetchSeqRef.current) {
        onLoading(false);
      }
    }
  }, [map, onMarkersUpdate, onZoomTooLow, onBboxTooLarge, onLoading]);

  const runFetchForCurrentViewport = useCallback(() => {
    map.invalidateSize();
    globalThis.requestAnimationFrame(() => {
      void fetchMarkers();
    });
  }, [fetchMarkers, map]);

  useEffect(() => {
    map.whenReady(runFetchForCurrentViewport);
  }, [map, runFetchForCurrentViewport]);

  useEffect(() => {
    map.whenReady(runFetchForCurrentViewport);
  }, [map, refreshKey, runFetchForCurrentViewport]);

  // Only moveend: zoomend also fires moveend, so listening to both causes a double fetch
  useMapEvents({
    moveend: () => {
      void fetchMarkers();
    },
  });

  return null;
}

// ── Cluster divIcon factory ───────────────────────────────────────────────────
function createClusterDivIcon(count: number): L.DivIcon {
  let bg: string;
  if (count > 100) bg = "#059669";
  else if (count > 20) bg = "#0d9488";
  else bg = "#0ea5e9";

  const size = Math.min(36 + Math.log2(count + 1) * 5, 60);
  const iconPx = Math.round(size * 0.42);
  const fontPx = size > 46 ? 11 : 10;
  const label = count > 999 ? "999+" : String(count);

  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer"><svg xmlns="http://www.w3.org/2000/svg" width="${iconPx}" height="${iconPx}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg><span style="color:white;font-size:${fontPx}px;font-weight:700;line-height:1">${label}</span></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ── Sub-component: cluster marker ────────────────────────────────────────────
interface ClusterCircleProps {
  lat: number;
  lng: number;
  count: number;
}

function ClusterCircle({ lat, lng, count }: Readonly<ClusterCircleProps>) {
  const map = useMap();
  const icon = useMemo(() => createClusterDivIcon(count), [count]);

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      eventHandlers={{
        click: () => map.flyTo([lat, lng], Math.min(map.getZoom() + 4, 18)),
      }}
    />
  );
}

// ── Tariff price helper ──────────────────────────────────────────────────────
function getTariffSummary(connector: EVSEConnector | undefined): string | null {
  const tariff = connector?.tariffs?.[0]?.tariff;
  if (!tariff?.elements?.length) return null;
  const prices = tariff.elements
    .flatMap((el) => el.price_components ?? [])
    .filter((pc) => pc.type === "ENERGY")
    .map((pc) => pc.price);
  if (!prices.length) return null;
  const currency = tariff.currency ?? "EUR";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max
    ? `${min.toFixed(2)} ${currency}/kWh`
    : `${min.toFixed(2)} – ${max.toFixed(2)} ${currency}/kWh`;
}

// ── Sub-component: location drawer ───────────────────────────────────────────
interface DrawerProps {
  locationId: string | null;
  onClose: () => void;
}

function LocationDrawer({ locationId, onClose }: Readonly<DrawerProps>) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchEVLocationDetail(locationId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setError(t("ev.detailError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [locationId, t]);

  const isOpen = !!locationId;
  useBodyScrollLock(isOpen);

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/30 z-900 md:hidden w-full cursor-default"
          aria-label="Close drawer"
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 md:bottom-auto md:top-0 md:right-0 md:left-auto
          md:h-full md:w-96
          bg-white shadow-2xl z-1000
          transition-transform duration-300 ease-in-out
          rounded-t-2xl md:rounded-none
          ${isOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full"}
          flex flex-col max-h-[75vh] md:max-h-full overflow-hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <LuZap
              className="shrink-0"
              size={18}
              style={{
                color: detail ? getLocationStatusColor(detail) : "#000C74",
              }}
            />
            <h2 className="font-semibold text-[#000C74] text-base">
              {detail?.name ?? t("ev.drawerTitle")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
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
              {(() => {
                const total = detail.evses?.length ?? 0;
                const available = detail.evses?.filter((e) => e.status === "AVAILABLE").length ?? 0;
                const charging = detail.evses?.filter((e) => e.status === "CHARGING").length ?? 0;
                const statusLabel = available > 0 ? "Disponible" : "No disponible";
                const statusClasses = available > 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800";

                return (
                  <div className={`rounded-2xl border px-4 py-3 ${statusClasses}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Estado de disponibilidad</p>
                    <p className="mt-1 text-2xl font-extrabold leading-none">{statusLabel}</p>
                    <p className="mt-2 text-xs font-semibold opacity-90">
                      {available} libres · {charging} en uso · {Math.max(total - available - charging, 0)} fuera de servicio
                    </p>
                  </div>
                );
              })()}

              {(() => {
                const operatorName = detail.operator?.name ?? detail.owner?.name;
                if (!operatorName) return null;

                const logo = detail.owner?.logo;
                const initials = operatorName.slice(0, 1).toUpperCase();
                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-xs text-gray-500 mb-2">Operador</p>
                    <div className="flex items-center gap-3">
                      {logo ? (
                        <img src={logo} alt={operatorName} className="h-10 w-10 rounded-xl object-contain bg-white border border-slate-200 p-1" />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-[#0f2f67] text-white font-bold flex items-center justify-center">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{operatorName}</p>
                        <p className="text-xs text-gray-500">Red de recarga</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Address */}
              {(detail.address || detail.city) && (
                <div className="flex items-start gap-3">
                  <LuMapPin className="text-gray-400 mt-0.5 shrink-0" size={16} />
                  <p className="text-gray-700 text-sm">
                    {[detail.address, detail.city, detail.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              )}

              {/* Operator */}
              {detail.owner?.website && (
                <a
                  href={`https://${detail.owner.website.replace(/^https?:\/\//, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-xs py-2 px-3 bg-blue-50 rounded-lg"
                >
                  <LuGlobe size={14} />
                  {detail.owner.website}
                </a>
              )}

              {detail.owner?.phone && (
                <div className="flex items-center gap-2 text-gray-700 text-sm py-2 px-3 bg-gray-50 rounded-lg">
                  <LuPhone size={16} className="text-gray-400" />
                  <span>{detail.owner.phone}</span>
                </div>
              )}

              {/* Opening times */}
              {detail.opening_times?.twentyfourseven && (
                <div className="flex items-center gap-3">
                  <LuClock className="text-gray-400 shrink-0" size={16} />
                  <span className="text-green-600 text-sm font-medium">24/7</span>
                </div>
              )}

              {/* EVSEs */}
              {detail.evses && detail.evses.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {t("ev.connectors")} ({detail.evses.length})
                  </h3>
                  <div className="space-y-2">
                    {detail.evses.slice(0, 10).map((evse, i) => {
                      const connector = evse.connectors?.[0];
                      const price = getTariffSummary(connector);
                      let dotColor = "bg-gray-300";
                      if (evse.status === "AVAILABLE") dotColor = "bg-green-500";
                      else if (evse.status === "CHARGING") dotColor = "bg-yellow-500";
                      return (
                        <div
                          key={evse.evse_id ?? evse.id ?? i}
                          className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                            <div>
                              <span className="text-base font-semibold text-gray-800">
                                {connector?.standard ?? "—"}
                              </span>
                              {price && (
                                <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-800">
                                  {price}
                                </p>
                              )}
                            </div>
                          </div>
                          {!!connector?.max_electric_power && (
                            <span className="text-sm text-gray-600 font-semibold">
                              {(connector.max_electric_power / 1000).toFixed(0)} kW
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Postal & Location */}
              {(detail.postal_code || detail.state) && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-900 font-medium">
                    {[detail.postal_code, detail.state].filter(Boolean).join(" • ")}
                  </p>
                </div>
              )}

              {/* Payment Methods */}
              {detail.evses?.some((e) => e.payment_methods?.length) && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Métodos de pago
                  </h3>
                  <div className="space-y-1">
                    {Array.from(
                      new Set(
                        detail.evses
                          .flatMap((e) => e.payment_methods ?? [])
                          .filter(Boolean)
                      )
                    ).map((method) => (
                      <p key={method} className="text-sm text-gray-700">• {method}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Badge */}
              {detail.evses && detail.evses.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center bg-gray-100 rounded-lg py-3 px-3">
                  {detail.evses.some((e) => e.status === "AVAILABLE") && (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                    <span className="flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                      {" Disponible"}
                    </span>
                  )}
                  {detail.evses.some((e) => e.status === "CHARGING") && (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                    <span className="flex items-center gap-1 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                      <span className="inline-block w-2 h-2 bg-amber-500 rounded-full" />
                      {" En uso"}
                    </span>
                  )}
                </div>
              )}

              {/* Info Footer */}
              {detail.source_type && (
                <div className="flex items-center gap-2 text-xs text-gray-500 justify-center pt-2">
                  <LuInfo size={12} />
                  <span>
                    {typeof detail.source_type === "string" ? detail.source_type : "OCPI"} • {detail.access_restricted ? "Restringido" : "Público"}
                  </span>
                </div>
              )}

              {detail.last_updated && (
                <p className="text-xs text-gray-400 text-center">
                  {t("ev.lastUpdated")}: {new Date(detail.last_updated).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SPAIN_CENTER: [number, number] = [40.4168, -3.7038];

export default function MapaRecarga() {
  const { t } = useTranslation();
  const isTouchDevice = useIsCoarsePointer();
  const [markers, setMarkers] = useState<EVMarker[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>(SPAIN_CENTER);
  const [locationGranted, setLocationGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zoomTooLow, setZoomTooLow] = useState(false);
  const [bboxTooLargeZoom, setBboxTooLargeZoom] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const locationCount = markers.filter((m) => m.type === "location").length;
  const clusterCount = markers.filter((m) => m.type === "cluster").length;
  const mapRefreshKey = locationGranted
    ? `${userLocation[0].toFixed(5)},${userLocation[1].toFixed(5)}`
    : "spain-default";

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserLocation([lat, lon]);
        setLocationGranted(true);
      },
      (error) => {
        console.warn("No se pudo obtener ubicacion EV:", error.message);
      },
      { timeout: 5000 }
    );
  }, []);

  return (
    <div className="w-full h-[calc(100vh-64px)] flex flex-col relative">

      {/* ── Header ── */}
      <div className="bg-[#000C74] text-white shadow z-10 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <LuZap size={18} /> {t("ev.title")}
              </h2>
              <p className="text-white/70 text-xs mt-0.5">
                {(() => {
                if (loading) return t("common.loading");
                if (zoomTooLow) return t("ev.zoomIn");
                if (bboxTooLargeZoom !== null) return t("ev.zoomInMore");
                if (markers.length === 0) return t("ev.noStations");
                return t("ev.showingMarkers", {
                  locations: locationCount,
                  clusters: clusterCount,
                });
              })()}
              </p>
              {isTouchDevice && (
                <p className="text-white/60 text-[11px] mt-1">Usa dos dedos para acercar/alejar el mapa</p>
              )}
            </div>

            {loading && (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            )}
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <MapContainer
        center={userLocation}
        zoom={locationGranted ? 13 : 6}
        className="flex-1 z-0"
        style={{ zIndex: 0 }}
        zoomControl
        scrollWheelZoom
        dragging={!isTouchDevice}
        touchZoom="center"
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
        />

        <MapUpdater center={userLocation} enabled={locationGranted} />
        <DefaultSpainViewController enabled={!locationGranted} />

        <EVMapController
          onMarkersUpdate={setMarkers}
          onZoomTooLow={setZoomTooLow}
          onBboxTooLarge={setBboxTooLargeZoom}
          onLoading={setLoading}
          refreshKey={mapRefreshKey}
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

        {markers.map((marker, i) => {
          if (marker.type === "cluster") {
            const { latitude, longitude, total_evse } = marker;
            return (
              <ClusterCircle
                key={`cluster-${i}-${latitude}-${longitude}`}
                lat={latitude}
                lng={longitude}
                count={total_evse}
              />
            );
          }

          // type === "location"
          const { id, latitude, longitude, status } = marker.location;
          const statusColor = getMarkerStatusColor(status);

          return (
            <Marker
              key={`loc-${id}`}
              position={[latitude, longitude]}
              icon={createLocationDivIcon(statusColor)}
              eventHandlers={{
                click: () => setSelectedLocationId(id),
              }}
            />
          );
        })}
      </MapContainer>

      {/* ── Details drawer ── */}
      <LocationDrawer
        locationId={selectedLocationId}
        onClose={() => setSelectedLocationId(null)}
      />
    </div>
  );
}
