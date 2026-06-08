import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  LuArrowUpDown,
  LuChevronDown,
  LuChevronUp,
  LuCrosshair,
  LuMapPin,
  LuNavigation,
  LuPencil,
  LuSearch,
  LuSlidersHorizontal,
  LuX,
} from "react-icons/lu";

import { useAuth } from "../contexts/AuthContext";
import {
  requestRouteRecommendations,
  type CombustibleTipo,
  type RecomendacionResponse,
} from "../api/recomendacion";
import { reverseGeocode, searchLocations } from "../api/geocoding";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

type RouteLocation = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type GasStation = {
  id: string;
  posicion: number;
  nombre: string;
  direccion: string;
  municipio: string;
  provincia: string;
  lat: number;
  lng: number;
  precio_litro: number;
  desvio_km: number;
  desvio_min_estimado: number;
  score: number;
  porcentaje_ruta: number;
  ahorro_vs_mas_cara_eur?: number | null;
};

type PickMode = "origin" | "destination" | null;

function useIsMobileLayout(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof globalThis.matchMedia !== "function") return false;
    return globalThis.matchMedia("(max-width: 767px)").matches;
  });

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;

    const media = globalThis.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();

    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function formatDurationShort(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  if (safeMinutes < 60) return `${safeMinutes} min`;

  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function pickDefaultStop(stations: GasStation[]): GasStation | null {
  if (!stations.length) return null;

  // Prefer candidates near the middle of the route with low detour and good price.
  return [...stations].sort((a, b) => {
    const aMid = Math.abs((a.porcentaje_ruta ?? 50) - 50);
    const bMid = Math.abs((b.porcentaje_ruta ?? 50) - 50);
    if (aMid !== bMid) return aMid - bMid;

    if (a.desvio_min_estimado !== b.desvio_min_estimado) {
      return a.desvio_min_estimado - b.desvio_min_estimado;
    }

    return a.precio_litro - b.precio_litro;
  })[0];
}

const fuelOptions: Array<{ value: CombustibleTipo; i18nKey: string }> = [
  { value: "gasolina_95", i18nKey: "fuel.gasoline95" },
  { value: "gasolina_98", i18nKey: "fuel.gasoline98" },
  { value: "gasoleo_a", i18nKey: "fuel.dieselA" },
  { value: "gasoleo_premium", i18nKey: "fuel.dieselPremium" },
  { value: "glp", i18nKey: "fuel.glp" },
  { value: "hidrogeno", i18nKey: "fuel.hydrogen" },
];

function mapProfileFuelToCombustible(
  favoriteFuel?: string,
  carFuelType?: "gasolina" | "diesel" | "electrico" | "hibrido"
): CombustibleTipo {
  const normalized = (favoriteFuel || "").toLowerCase();
  if (normalized.includes("98")) return "gasolina_98";
  if (normalized.includes("95")) return "gasolina_95";
  if (normalized.includes("premium") && normalized.includes("gasoleo")) return "gasoleo_premium";
  if (normalized.includes("gasoleo") || normalized.includes("gasóleo")) return "gasoleo_a";
  if (normalized.includes("glp")) return "glp";
  if (normalized.includes("hidrogen")) return "hidrogeno";

  if (carFuelType === "diesel") return "gasoleo_a";
  return "gasolina_95";
}

function createMarkerIcon(kind: "origin" | "destination" | "station" | "selected") {
  const spec: Record<string, { bg: string; ring: string; size: number }> = {
    origin: { bg: "#2563eb", ring: "#bfdbfe", size: 22 },
    destination: { bg: "#dc2626", ring: "#fecaca", size: 24 },
    station: { bg: "#0f766e", ring: "#99f6e4", size: 18 },
    selected: { bg: "#0f172a", ring: "#f59e0b", size: 22 },
  };

  const { bg, ring, size } = spec[kind];
  return L.divIcon({
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:999px;background:${bg};border:3px solid white;box-shadow:0 0 0 3px ${ring},0 6px 16px rgba(15,23,42,.22)"></span>`,
    className: "route-marker-icon",
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
  });
}

function FitRouteBounds({
  coordinates,
  isMobileLayout,
  hasBottomSheet,
}: {
  coordinates: [number, number][];
  isMobileLayout: boolean;
  hasBottomSheet: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      map.invalidateSize();

      if (coordinates.length < 2) return;

      const bounds = L.latLngBounds(coordinates);
      const topPadding = isMobileLayout ? 64 : 32;
      const leftPadding = !isMobileLayout ? 420 : 16;
      const rightPadding = !isMobileLayout && hasBottomSheet ? 440 : 24;
      const bottomPadding = isMobileLayout && hasBottomSheet ? 420 : 32;

      map.fitBounds(bounds, {
        paddingTopLeft: [leftPadding, topPadding],
        paddingBottomRight: [rightPadding, bottomPadding],
        maxZoom: 14,
        animate: true,
      });
    }, 120);

    return () => globalThis.clearTimeout(timer);
  }, [coordinates, hasBottomSheet, isMobileLayout, map]);

  return null;
}

function MapPickMode({ pickMode, onPick }: { pickMode: PickMode; onPick: (lat: number, lng: number, mode: Exclude<PickMode, null>) => void }) {
  useMapEvents({
    click(e) {
      if (!pickMode) return;
      onPick(e.latlng.lat, e.latlng.lng, pickMode);
    },
  });

  return null;
}

export default function Rutas() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isMobileLayout = useIsMobileLayout();

  const [origin, setOrigin] = useState<RouteLocation | null>(null);
  const [destination, setDestination] = useState<RouteLocation | null>(null);
  const [originInput, setOriginInput] = useState("");
  const [destinationInput, setDestinationInput] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<RouteLocation[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<RouteLocation[]>([]);
  const [showOriginList, setShowOriginList] = useState(false);
  const [showDestinationList, setShowDestinationList] = useState(false);
  const [loadingOriginSearch, setLoadingOriginSearch] = useState(false);
  const [loadingDestinationSearch, setLoadingDestinationSearch] = useState(false);
  const [loadingOriginGeolocation, setLoadingOriginGeolocation] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(true);

  const [selectedFuel, setSelectedFuel] = useState<CombustibleTipo>(
    mapProfileFuelToCombustible(user?.combustible_favorito, user?.tipo_combustible_coche)
  );
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [maxDetourKm, setMaxDetourKm] = useState(8);
  const [maxDetourMin, setMaxDetourMin] = useState(5);
  const [resultLimit, setResultLimit] = useState(20);

  const [showFilters, setShowFilters] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [gasStationsNearRoute, setGasStationsNearRoute] = useState<GasStation[]>([]);
  const [selectedStop, setSelectedStop] = useState<GasStation | null>(null);

  useBodyScrollLock(false);

  useEffect(() => {
    setSelectedFuel(mapProfileFuelToCombustible(user?.combustible_favorito, user?.tipo_combustible_coche));
  }, [user?.combustible_favorito, user?.tipo_combustible_coche]);

  const clearRouteResult = () => {
    setRouteCoordinates([]);
    setRouteInfo(null);
    setGasStationsNearRoute([]);
    setSelectedStop(null);
    setRouteError(null);
  };

  const mapApiItemToStation = (item: RecomendacionResponse["recomendaciones"][number]): GasStation => ({
    id: item.gasolinera.id || `station-${item.posicion}`,
    posicion: item.posicion,
    nombre: item.gasolinera.nombre || `Gasolinera ${item.posicion}`,
    direccion: item.gasolinera.direccion || "",
    municipio: item.gasolinera.municipio || "",
    provincia: item.gasolinera.provincia || "",
    lat: item.gasolinera.lat,
    lng: item.gasolinera.lon,
    precio_litro: item.precio_litro,
    desvio_km: item.desvio_km,
    desvio_min_estimado: item.desvio_min_estimado,
    score: item.score,
    porcentaje_ruta: item.porcentaje_ruta,
    ahorro_vs_mas_cara_eur: item.ahorro_vs_mas_cara_eur,
  });

  const selectOrigin = (location: RouteLocation) => {
    setOrigin(location);
    setOriginInput(location.name);
    setShowOriginList(false);
    clearRouteResult();
  };

  const selectDestination = (location: RouteLocation) => {
    setDestination(location);
    setDestinationInput(location.name);
    setShowDestinationList(false);
    clearRouteResult();
  };

  const resolveCurrentPosition = () => {
    if (!navigator.geolocation) {
      setRouteError(t("accessibility.geolocationNotSupported"));
      return;
    }

    setLoadingOriginGeolocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const result = await reverseGeocode(latitude, longitude);
          selectOrigin({
            ...result,
            name: result.name || t("routes.mapPoint"),
          });
        } catch (error) {
          setRouteError(error instanceof Error ? error.message : t("accessibility.geolocationError"));
        } finally {
          setLoadingOriginGeolocation(false);
        }
      },
      () => {
        setLoadingOriginGeolocation(false);
        setRouteError(t("accessibility.geolocationError"));
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    if (!origin) {
      resolveCurrentPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const query = destinationInput.trim();
    if (query.length < 1) {
      setDestinationSuggestions([]);
      return;
    }

    const timer = globalThis.setTimeout(async () => {
      try {
        setLoadingDestinationSearch(true);
        const items = await searchLocations(query, 6);
        setDestinationSuggestions(items);
      } catch {
        setDestinationSuggestions([]);
      } finally {
        setLoadingDestinationSearch(false);
      }
    }, 250);

    return () => globalThis.clearTimeout(timer);
  }, [destinationInput]);

  useEffect(() => {
    const query = originInput.trim();
    if (query.length < 1) {
      setOriginSuggestions([]);
      return;
    }

    const timer = globalThis.setTimeout(async () => {
      try {
        setLoadingOriginSearch(true);
        const items = await searchLocations(query, 6);
        setOriginSuggestions(items);
      } catch {
        setOriginSuggestions([]);
      } finally {
        setLoadingOriginSearch(false);
      }
    }, 250);

    return () => globalThis.clearTimeout(timer);
  }, [originInput]);

  const calculateRoute = async () => {
    if (!origin || !destination) return;

    setLoadingRoute(true);
    setRouteError(null);

    try {
      const data = await requestRouteRecommendations({
        origen: { lat: origin.lat, lon: origin.lng, nombre: origin.name },
        destino: { lat: destination.lat, lon: destination.lng, nombre: destination.name },
        posicion_actual: { lat: origin.lat, lon: origin.lng, nombre: origin.name },
        origin: { lat: origin.lat, lon: origin.lng, nombre: origin.name },
        destination: { lat: destination.lat, lon: destination.lng, nombre: destination.name },
        combustible: selectedFuel,
        max_desvio_km: maxDetourKm,
        max_detour_minutes: maxDetourMin,
        max_detour_time: maxDetourMin,
        top_n: resultLimit,
        peso_precio: 0.6,
        peso_desvio: 0.4,
        litros_deposito: 50,
        evitar_peajes: avoidTolls,
        avoid_tolls: avoidTolls,
      });

      const geojsonRouteFeature = data.geojson?.features?.find(
        (feature) => feature.geometry?.type === "LineString"
      );

      const routeCoordinates = Array.isArray(geojsonRouteFeature?.geometry?.coordinates)
        ? (geojsonRouteFeature.geometry.coordinates as [number, number][])
        : data.ruta_base.coordinates || [];

      const leafletCoords: [number, number][] = routeCoordinates
        .filter((coord) => Array.isArray(coord) && coord.length >= 2)
        .map((coord) => [coord[1], coord[0]] as [number, number]);

      const fullList = data.recomendaciones?.map(mapApiItemToStation) ?? [];

      setRouteCoordinates(leafletCoords);
      setRouteInfo({
        distanceKm: data.ruta_base.distancia_km,
        durationMin: data.ruta_base.duracion_min,
      });
      setGasStationsNearRoute(fullList);
      setSelectedStop(pickDefaultStop(fullList));
      setShowSearchPanel(false);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : t("routes.genericRouteError"));
      clearRouteResult();
    } finally {
      setLoadingRoute(false);
    }
  };

  const handlePickFromMap = async (lat: number, lng: number, mode: Exclude<PickMode, null>) => {
    try {
      const location = await reverseGeocode(lat, lng);
      const normalized: RouteLocation = {
        ...location,
        name: location.name || t("routes.mapPoint"),
      };
      if (mode === "origin") {
        selectOrigin(normalized);
      } else {
        selectDestination(normalized);
      }
      setPickMode(null);
    } catch {
      setRouteError(t("routes.genericRouteError"));
    }
  };

  const startNavigationInGoogleMaps = () => {
    if (!origin || !destination) return;

    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
    url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
    url.searchParams.set("travelmode", "driving");

    if (selectedStop) {
      url.searchParams.set("waypoints", `${selectedStop.lat},${selectedStop.lng}`);
    }

    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  const mapCenter = useMemo(() => {
    if (selectedStop) return [selectedStop.lat, selectedStop.lng] as [number, number];
    if (destination) return [destination.lat, destination.lng] as [number, number];
    if (origin) return [origin.lat, origin.lng] as [number, number];
    return [40.4168, -3.7038] as [number, number];
  }, [selectedStop, destination, origin]);

  const candidateStops = useMemo(() => gasStationsNearRoute, [gasStationsNearRoute]);

  const updateMaxDetourMinutes = (value: number) => {
    const normalized = Math.max(1, Math.min(120, Math.round(value || 1)));
    setMaxDetourMin(normalized);
    clearRouteResult();
  };

  return (
    <div className="relative h-[calc(100dvh-60px)] overflow-hidden">
      {/* ── Mapa full screen ── */}
      <MapContainer
        center={mapCenter}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        scrollWheelZoom={!isMobileLayout}
        dragging
        touchZoom
        className="absolute inset-0 z-0"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        <FitRouteBounds
          coordinates={routeCoordinates}
          isMobileLayout={isMobileLayout}
          hasBottomSheet={Boolean(routeInfo)}
        />
        <MapPickMode pickMode={pickMode} onPick={handlePickFromMap} />
        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color="#2563eb" weight={5} opacity={0.9} />
        )}
        {origin && <Marker position={[origin.lat, origin.lng]} icon={createMarkerIcon("origin")} />}
        {destination && <Marker position={[destination.lat, destination.lng]} icon={createMarkerIcon("destination")} />}
        {gasStationsNearRoute.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={createMarkerIcon(selectedStop?.id === station.id ? "selected" : "station")}
            eventHandlers={{ click: () => setSelectedStop(station) }}
          />
        ))}
      </MapContainer>

      {/* ── Tarjeta de búsqueda flotante ── */}
      <div className="absolute top-3 left-3 right-3 z-[1200] md:left-4 md:right-auto md:w-[388px]">
        {showSearchPanel ? (
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/15 ring-1 ring-black/6 overflow-visible">

            {/* Inputs */}
            <div className="px-4 pt-4 pb-3">

              {/* Origen */}
              <div className="relative flex items-center gap-3">
                <div className="flex flex-col items-center shrink-0 w-5">
                  <div className="w-3 h-3 rounded-full bg-blue-500 ring-[3px] ring-blue-100 shrink-0" />
                </div>
                <div className="flex-1 min-w-0 relative">
                  <input
                    className="w-full text-[14px] font-medium text-gray-900 placeholder-gray-400 outline-none bg-transparent pr-8 py-0.5 truncate"
                    placeholder={t("routes.fromPlaceholder")}
                    value={originInput}
                    onFocus={() => setShowOriginList(true)}
                    onChange={(e) => { setOriginInput(e.target.value); setShowOriginList(true); }}
                  />
                  <button
                    type="button"
                    onClick={resolveCurrentPosition}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-blue-500 hover:bg-blue-50 transition"
                    aria-label={t("routes.useCurrentLocation")}
                  >
                    {(loadingOriginGeolocation || loadingOriginSearch)
                      ? <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      : <LuCrosshair size={14} />
                    }
                  </button>
                  {showOriginList && originSuggestions.length > 0 && (
                    <ul className="absolute z-[1250] top-full mt-2 left-0 right-0 bg-white rounded-xl border border-gray-100 shadow-2xl shadow-black/10 overflow-hidden">
                      {originSuggestions.slice(0, 5).map((item, idx) => (
                        <li key={`${item.lat}-${item.lng}-${idx}`}>
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition"
                            onClick={() => selectOrigin(item)}
                          >
                            <LuMapPin className="shrink-0 text-gray-400 mt-0.5" size={13} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-gray-900">{item.name}</span>
                              <span className="block truncate text-xs text-gray-400">{item.address}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Conector + swap */}
              <div className="flex items-center gap-3 my-2.5">
                <div className="w-5 flex justify-center">
                  <div className="w-px h-5 bg-gray-200" />
                </div>
                <div className="flex-1 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={() => {
                    const o = origin; setOrigin(destination); setDestination(o);
                    const oi = originInput; setOriginInput(destinationInput); setDestinationInput(oi);
                    clearRouteResult();
                  }}
                  className="w-7 h-7 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition shrink-0"
                  title={t("routes.swap")}
                  aria-label={t("routes.swap")}
                >
                  <LuArrowUpDown size={12} />
                </button>
              </div>

              {/* Destino */}
              <div className="relative flex items-center gap-3">
                <div className="flex flex-col items-center shrink-0 w-5">
                  <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                </div>
                <div className="flex-1 min-w-0 relative">
                  <input
                    className="w-full text-[14px] font-medium text-gray-900 placeholder-gray-400 outline-none bg-transparent pr-8 py-0.5 truncate"
                    placeholder={t("routes.toPlaceholder")}
                    value={destinationInput}
                    onFocus={() => setShowDestinationList(true)}
                    onChange={(e) => { setDestinationInput(e.target.value); setShowDestinationList(true); }}
                  />
                  <button
                    type="button"
                    className={`absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition ${pickMode === "destination" ? "text-blue-600 bg-blue-50" : "text-gray-400 hover:bg-gray-50"}`}
                    onClick={() => setPickMode((prev) => (prev === "destination" ? null : "destination"))}
                    title={t("routes.pickDestinationOnMap")}
                    aria-label={t("routes.pickDestinationOnMap")}
                  >
                    {loadingDestinationSearch
                      ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                      : <LuMapPin size={14} />
                    }
                  </button>
                  {showDestinationList && destinationSuggestions.length > 0 && (
                    <ul className="absolute z-[1250] top-full mt-2 left-0 right-0 bg-white rounded-xl border border-gray-100 shadow-2xl shadow-black/10 overflow-hidden">
                      {destinationSuggestions.slice(0, 5).map((item, idx) => (
                        <li key={`${item.lat}-${item.lng}-${idx}`}>
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition"
                            onClick={() => selectDestination(item)}
                          >
                            <LuMapPin className="shrink-0 text-gray-400 mt-0.5" size={13} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-gray-900">{item.name}</span>
                              <span className="block truncate text-xs text-gray-400">{item.address}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Barra de acciones */}
            <div className="border-t border-gray-100 px-3 py-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((f) => !f)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition border shrink-0 ${
                  showFilters
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
                aria-expanded={showFilters}
              >
                <LuSlidersHorizontal size={13} />
                {t("routes.options", { defaultValue: "Opciones" })}
                {showFilters ? <LuChevronUp size={11} /> : <LuChevronDown size={11} />}
              </button>

              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 bg-[#1f4fa0] hover:bg-[#1a4491] active:bg-[#163a88] text-white rounded-xl py-2 px-4 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px]"
                disabled={!origin || !destination || loadingRoute}
                onClick={calculateRoute}
              >
                {loadingRoute ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin shrink-0" />
                    {t("routes.calculating")}
                  </>
                ) : (
                  <>
                    <LuSearch size={14} />
                    {t("routes.calculateRoute")}
                  </>
                )}
              </button>
            </div>

            {/* Panel de opciones (colapsable) */}
            {showFilters && (
              <div className="border-t border-gray-100 px-4 pt-3 pb-4 bg-gray-50/60 space-y-4 rounded-b-2xl">

                {/* Combustible */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                    {t("routes.fuelForComparison")}
                  </label>
                  <select
                    className="w-full rounded-xl border border-gray-200 bg-white text-sm px-3 py-2.5 text-gray-800 outline-none focus:ring-2 focus:ring-blue-400/30 transition"
                    value={selectedFuel}
                    onChange={(e) => { setSelectedFuel(e.target.value as CombustibleTipo); clearRouteResult(); }}
                  >
                    {fuelOptions.map((fuel) => (
                      <option key={fuel.value} value={fuel.value}>{t(fuel.i18nKey)}</option>
                    ))}
                  </select>
                </div>

                {/* Desvío */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                    {t("routes.maxDetour", { defaultValue: "Desvío máximo permitido" })}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent text-center"
                        value={maxDetourKm}
                        onChange={(e) => { setMaxDetourKm(Number(e.target.value) || 1); clearRouteResult(); }}
                      />
                      <span className="text-xs text-gray-400 shrink-0">km</span>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent text-center"
                        value={maxDetourMin}
                        onChange={(e) => updateMaxDetourMinutes(Number(e.target.value))}
                        onBlur={(e) => updateMaxDetourMinutes(Number(e.target.value))}
                      />
                      <span className="text-xs text-gray-400 shrink-0">min</span>
                    </div>
                  </div>
                </div>

                {/* Peajes + resultados */}
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <div
                      role="checkbox"
                      aria-checked={avoidTolls}
                      tabIndex={0}
                      onClick={() => { setAvoidTolls((v) => !v); clearRouteResult(); }}
                      onKeyDown={(e) => e.key === " " && (setAvoidTolls((v) => !v), clearRouteResult())}
                      className={`relative w-9 h-5 rounded-full transition cursor-pointer ${avoidTolls ? "bg-blue-600" : "bg-gray-300"}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${avoidTolls ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    <span className="text-sm text-gray-700 font-medium">
                      {t("routes.avoidTolls", { defaultValue: "Evitar peajes" })}
                    </span>
                  </label>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">
                      {t("routes.resultLimit", { defaultValue: "Máx." })}
                    </span>
                    <select
                      className="rounded-lg border border-gray-200 bg-white text-xs px-2 py-1.5 text-gray-700 outline-none"
                      value={resultLimit}
                      onChange={(e) => { setResultLimit(Number(e.target.value)); clearRouteResult(); }}
                    >
                      {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Pick-mode hint */}
            {pickMode && (
              <div className="border-t border-dashed border-blue-200 bg-blue-50/80 px-4 py-2.5 flex items-center gap-2 rounded-b-2xl">
                <LuMapPin size={14} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 font-medium flex-1">
                  {pickMode === "origin" ? t("routes.mapPickOriginHint") : t("routes.mapPickDestinationHint")}
                </p>
                <button
                  type="button"
                  className="shrink-0 p-1 rounded-full text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition"
                  onClick={() => setPickMode(null)}
                  aria-label="Cancelar selección"
                >
                  <LuX size={13} />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Pill colapsado mostrando origen → destino */
          <button
            type="button"
            className="flex items-center gap-2 bg-white rounded-full shadow-xl shadow-black/10 ring-1 ring-black/6 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition max-w-full"
            onClick={() => { setShowSearchPanel(true); clearRouteResult(); }}
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-sm font-medium text-gray-800 truncate max-w-[110px]">
              {origin?.name.split(",")[0] ?? "…"}
            </span>
            <LuArrowUpDown size={11} className="text-gray-400 shrink-0" />
            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm font-medium text-gray-800 truncate max-w-[110px]">
              {destination?.name.split(",")[0] ?? "…"}
            </span>
            <LuPencil size={12} className="text-gray-400 shrink-0 ml-0.5" />
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {routeError && (
        <div
          className="absolute z-[1190] left-3 right-3 bottom-[5.5rem] md:left-auto md:right-5 md:top-[4.5rem] md:bottom-auto md:w-[388px] rounded-2xl border border-red-200 bg-white px-4 py-3 shadow-xl flex items-start gap-3"
          role="alert"
        >
          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <LuX size={11} className="text-red-500" />
          </div>
          <p className="text-sm text-red-700 flex-1">{routeError}</p>
          <button
            type="button"
            className="shrink-0 text-red-300 hover:text-red-500 transition p-0.5"
            onClick={() => setRouteError(null)}
            aria-label="Cerrar"
          >
            <LuX size={14} />
          </button>
        </div>
      )}

      {/* ── Panel de resultados ── */}
      {routeInfo && (
        <section className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-[1180] px-3 pb-[max(env(safe-area-inset-bottom),0px)] md:inset-auto md:right-5 md:top-[76px] md:bottom-auto md:w-[388px] md:px-0 md:pb-0">
          <div className="pointer-events-auto rounded-t-3xl md:rounded-2xl bg-white shadow-2xl shadow-black/12 ring-1 ring-black/6 flex flex-col overflow-hidden">

            {/* Drag handle (solo móvil) */}
            <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-gray-200 md:hidden shrink-0" />

            {/* Contenido desplazable */}
            <div className="overflow-y-auto overscroll-contain px-4 pt-2 pb-2 space-y-2.5 max-h-[34vh] md:max-h-[calc(100dvh-160px)]">

              {/* Resumen de ruta */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#f0f5ff] px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400">
                    {t("routes.distance")}
                  </p>
                  <p className="text-lg font-extrabold text-[#0f2f67] mt-0.5">
                    {routeInfo.distanceKm.toFixed(1)}
                    <span className="text-xs font-semibold text-blue-400 ml-1">km</span>
                  </p>
                </div>
                <div className="rounded-xl bg-[#f0f5ff] px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400">
                    {t("routes.duration")}
                  </p>
                  <p className="text-lg font-extrabold text-[#0f2f67] mt-0.5">
                    {formatDurationShort(routeInfo.durationMin)}
                  </p>
                </div>
              </div>

              {/* Lista de candidatas */}
              {candidateStops.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {t("routes.stopOptions")}
                    </h3>
                    <span className="text-[10px] font-semibold text-gray-400">
                      {candidateStops.length} paradas
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {candidateStops.map((station) => {
                      const isSelected = selectedStop?.id === station.id;
                      return (
                        <button
                          key={station.id}
                          type="button"
                          className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                            isSelected
                              ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                              : "border-gray-100 bg-white hover:bg-gray-50"
                          }`}
                          onClick={() => setSelectedStop(station)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-gray-900 flex-1">{station.nombre}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-sm font-bold text-gray-900">€{station.precio_litro.toFixed(3)}</span>
                              <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
                                #{station.posicion}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-400 flex-1 truncate">
                              {station.municipio}{station.provincia ? ` · ${station.provincia}` : ""}
                            </span>
                            <span className="text-[10px] text-gray-400 shrink-0">
                              +{station.desvio_km.toFixed(1)} km · +{formatDurationShort(station.desvio_min_estimado)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Botón navegar — siempre visible fuera del scroll */}
            <div className="px-4 pb-4 pt-2.5 border-t border-gray-100 shrink-0">
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1f4fa0] hover:bg-[#1a4491] active:bg-[#163a88] text-white py-3 text-sm font-bold transition disabled:opacity-50"
                onClick={startNavigationInGoogleMaps}
                disabled={!origin || !destination}
              >
                <LuNavigation size={15} />
                {selectedStop
                  ? t("routes.openInGoogleWithStop", { defaultValue: "Iniciar ruta con parada" })
                  : t("routes.openInGoogle", { defaultValue: "Iniciar ruta" })}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
