import { useEffect, useRef, useState, useCallback } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { LuZap, LuMapPin, LuBuilding2, LuClock, LuX, LuZoomIn } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import {
  BoundingBoxTooLargeError,
  EVMarker,
  LocationDetail,
  fetchEVLocationDetail,
  fetchEVMarkers,
} from "../api/charging";

// ── Leaflet default icon fix (Vite asset path issue) ──────────────────────────
const locationIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ── Sub-component: listens to map move/zoom and fetches markers ───────────────
interface MapControllerProps {
  onMarkersUpdate: (markers: EVMarker[]) => void;
  onZoomTooLow: (show: boolean) => void;
  onBboxTooLarge: (requiredZoom: number | null) => void;
  onLoading: (loading: boolean) => void;
}

function EVMapController({
  onMarkersUpdate,
  onZoomTooLow,
  onBboxTooLarge,
  onLoading,
}: MapControllerProps) {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);

  const fetchMarkers = useCallback(async () => {
    const zoom = map.getZoom();
    if (zoom <= 8) {
      onZoomTooLow(true);
      onMarkersUpdate([]);
      return;
    }
    onZoomTooLow(false);

    // Cancel previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

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
      onMarkersUpdate(markers);
      onBboxTooLarge(null);
    } catch (err) {
      if (err instanceof BoundingBoxTooLargeError) {
        onBboxTooLarge(err.requiredZoom);
        onMarkersUpdate([]);
      } else {
        console.error("EV markers fetch error:", err);
      }
    } finally {
      onLoading(false);
    }
  }, [map, onMarkersUpdate, onZoomTooLow, onBboxTooLarge, onLoading]);

  // Fetch on initial load
  useEffect(() => {
    fetchMarkers();
  }, [fetchMarkers]);

  useMapEvents({
    moveend: () => { fetchMarkers(); },
    zoomend: () => { fetchMarkers(); },
  });

  return null;
}

// ── Sub-component: cluster circle marker ─────────────────────────────────────
interface ClusterCircleProps {
  lat: number;
  lng: number;
  count: number;
}

function ClusterCircle({ lat, lng, count }: Readonly<ClusterCircleProps>) {
  const map = useMap();
  const radius = Math.min(10 + Math.log2(count + 1) * 5, 40);
  let color: string;
  if (count > 20) { color = "#059669"; }
  else if (count > 5) { color = "#0d9488"; }
  else { color = "#0ea5e9"; }

  return (
    <CircleMarker
      center={[lat, lng]}
      radius={radius}
      pathOptions={{ color: "white", fillColor: color, fillOpacity: 0.9, weight: 2 }}
      eventHandlers={{
        click: () => map.setZoom(map.getZoom() + 2),
      }}
    >
      <Tooltip permanent direction="center" className="ev-cluster-label">
        <span className="font-bold text-white text-xs">{count}</span>
      </Tooltip>
    </CircleMarker>
  );
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
            <LuZap className="text-[#000C74] shrink-0" size={18} />
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
              {detail.operator?.name && (
                <div className="flex items-center gap-3">
                  <LuBuilding2 className="text-gray-400 shrink-0" size={16} />
                  <p className="text-gray-700 text-sm">{detail.operator.name}</p>
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
                    {detail.evses.slice(0, 10).map((evse, i) => (
                      <div
                        key={evse.id ?? i}
                        className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                        {(() => {
                          let dotColor = "bg-gray-300";
                          if (evse.status === "AVAILABLE") dotColor = "bg-green-500";
                          else if (evse.status === "CHARGING") dotColor = "bg-yellow-500";
                          return <span className={`w-2 h-2 rounded-full ${dotColor}`} />;
                        })()}
                          <span className="text-sm text-gray-700">
                            {evse.connectors?.[0]?.standard ?? "—"}
                          </span>
                        </div>
                        {!!evse.connectors?.[0]?.max_electric_power && (
                          <span className="text-xs text-gray-500 font-medium">
                            {(evse.connectors[0].max_electric_power / 1000).toFixed(0)} kW
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.last_updated && (
                <p className="text-xs text-gray-400 text-right">
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

const MIN_ZOOM_TO_FETCH = 8;
const SPAIN_CENTER: [number, number] = [40.4168, -3.7038];

export default function MapaRecarga() {
  const { t } = useTranslation();
  const [markers, setMarkers] = useState<EVMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [zoomTooLow, setZoomTooLow] = useState(true);
  const [bboxTooLargeZoom, setBboxTooLargeZoom] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const locationCount = markers.filter((m) => m.type === "location").length;
  const clusterCount = markers.filter((m) => m.type === "cluster").length;

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
            </div>

            {loading && (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            )}
          </div>
        </div>
      </div>

      {/* ── Zoom hint banner ── */}
      {(zoomTooLow || bboxTooLargeZoom !== null) && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-500 pointer-events-none">
          <div className="bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <LuZoomIn className="w-4 h-4" />
            {bboxTooLargeZoom
              ? t("ev.zoomInMoreHint", { zoom: bboxTooLargeZoom })
              : t("ev.zoomInHint", { zoom: MIN_ZOOM_TO_FETCH + 1 })}
          </div>
        </div>
      )}

      {/* ── Map ── */}
      <MapContainer
        center={SPAIN_CENTER}
        zoom={6}
        className="flex-1 z-0"
        style={{ zIndex: 0 }}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <EVMapController
          onMarkersUpdate={setMarkers}
          onZoomTooLow={setZoomTooLow}
          onBboxTooLarge={setBboxTooLargeZoom}
          onLoading={setLoading}
        />

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
          const { id, name, latitude, longitude } = marker.location;
          return (
            <Marker
              key={`loc-${id}`}
              position={[latitude, longitude]}
              icon={locationIcon}
              eventHandlers={{
                click: () => setSelectedLocationId(id),
              }}
            >
              <Popup>
                <div className="text-sm font-medium">{name}</div>
                <button
                  className="text-xs text-[#000C74] underline mt-1"
                  onClick={() => setSelectedLocationId(id)}
                >
                  {t("ev.viewDetails")}
                </button>
              </Popup>
            </Marker>
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
