import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  LuArrowUpDown,
  LuCrosshair,
  LuLocateFixed,
  LuMapPin,
  LuNavigation,
  LuPencil,
  LuSearch,
} from "react-icons/lu";

import { useAuth } from "../contexts/AuthContext";
import {
  requestRouteRecommendations,
  type CombustibleTipo,
  type RecomendacionResponse,
} from "../api/recomendacion";
import { reverseGeocode, searchLocations } from "../api/geocoding";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useIsCoarsePointer } from "../hooks/useIsCoarsePointer";

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

function FitRouteBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (coordinates.length < 2) return;
    map.fitBounds(coordinates, {
      padding: [32, 32],
      maxZoom: 14,
    });
  }, [coordinates, map]);

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
  const isTouchDevice = useIsCoarsePointer();

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

  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [gasStationsNearRoute, setGasStationsNearRoute] = useState<GasStation[]>([]);
  const [selectedStop, setSelectedStop] = useState<GasStation | null>(null);

  useBodyScrollLock(isTouchDevice && showSearchPanel);

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
    if (query.length < 2) {
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
    }, 320);

    return () => globalThis.clearTimeout(timer);
  }, [destinationInput]);

  useEffect(() => {
    const query = originInput.trim();
    if (query.length < 2) {
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
    }, 320);

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

  return (
    <div className="relative min-h-[calc(100vh-60px)] overflow-hidden bg-[#edf2ff]">
      <MapContainer
        center={mapCenter}
        zoom={12}
        style={{ height: "calc(100vh - 60px)", width: "100%" }}
        scrollWheelZoom
        dragging={!isTouchDevice}
        touchZoom="center"
        className="z-0"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        <FitRouteBounds coordinates={routeCoordinates} />
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
            eventHandlers={{
              click: () => setSelectedStop(station),
            }}
          />
        ))}
      </MapContainer>

      <section
        className={isTouchDevice && showSearchPanel
          ? "fixed inset-0 z-[1300] bg-white"
          : "pointer-events-none absolute left-0 right-0 top-0 z-40 px-3 pt-3 md:left-4 md:right-auto md:w-[430px] md:px-0 md:pt-4"}
      >
        <div className={isTouchDevice && showSearchPanel ? "h-full overflow-y-auto p-4" : "pointer-events-auto w-full"}>
          {showSearchPanel ? (
            <div className={`border border-[#d7e2f5] bg-white ${isTouchDevice ? "min-h-full rounded-none p-0 shadow-none" : "rounded-2xl p-3 shadow-xl shadow-[#1e3a8a]/12 backdrop-blur"}`}>
              {isTouchDevice && (
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d9e4f7] bg-white px-3 py-3">
                  <h2 className="text-base font-bold text-[#17386f]">{t("routes.title")}</h2>
                  <button
                    type="button"
                    onClick={() => setShowSearchPanel(false)}
                    className="rounded-lg border border-[#d3def2] px-3 py-1.5 text-xs font-semibold text-[#1d3e7a]"
                  >
                    {t("common.close")}
                  </button>
                </div>
              )}

              <div className={`${isTouchDevice ? "p-3 space-y-3" : "space-y-3"}`}>
                <div className="relative">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#415b8e]">{t("routes.from")}</label>
                  <div className="relative">
                    <LuLocateFixed className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5b77ad]" />
                    <input
                      className="w-full rounded-xl border border-[#cdd9ee] bg-[#f8fbff] py-2.5 pl-9 pr-11 text-sm text-[#13295b] outline-none ring-[#1d4ed8]/20 focus:ring-3"
                      placeholder={t("routes.fromPlaceholder")}
                      value={originInput}
                      onFocus={() => setShowOriginList(true)}
                      onChange={(e) => {
                        setOriginInput(e.target.value);
                        setShowOriginList(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={resolveCurrentPosition}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#1f4f99] hover:bg-[#e7efff]"
                      title={t("routes.useCurrentLocation")}
                      aria-label={t("routes.useCurrentLocation")}
                    >
                      <LuCrosshair size={16} />
                    </button>
                  </div>
                  {showOriginList && originSuggestions.length > 0 && (
                    <ul className="absolute z-[1200] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#cfdbf1] bg-white py-1 shadow-lg">
                      {originSuggestions.map((item, idx) => (
                        <li key={`${item.lat}-${item.lng}-${idx}`}>
                          <button
                            type="button"
                            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#f3f7ff]"
                            onClick={() => selectOrigin(item)}
                          >
                            <LuMapPin className="mt-1 shrink-0 text-[#3b63a8]" size={15} />
                            <span className="block min-w-0">
                              <span className="block truncate text-sm font-semibold text-[#16326d]">{item.name}</span>
                              <span className="block truncate text-xs text-[#637da9]">{item.address}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(loadingOriginSearch || loadingOriginGeolocation) && (
                    <p className="pt-1 text-xs text-[#617aab]">{t("routes.searching")}</p>
                  )}
                </div>

                <div className="relative">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#415b8e]">{t("routes.to")}</label>
                  <div className="relative">
                    <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5b77ad]" />
                    <input
                      className="w-full rounded-xl border border-[#cdd9ee] bg-[#f8fbff] py-2.5 pl-9 pr-3 text-sm text-[#13295b] outline-none ring-[#1d4ed8]/20 focus:ring-3"
                      placeholder={t("routes.toPlaceholder")}
                      value={destinationInput}
                      onFocus={() => setShowDestinationList(true)}
                      onChange={(e) => {
                        setDestinationInput(e.target.value);
                        setShowDestinationList(true);
                      }}
                    />
                  </div>
                  {showDestinationList && destinationSuggestions.length > 0 && (
                    <ul className="absolute z-[1200] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#cfdbf1] bg-white py-1 shadow-lg">
                      {destinationSuggestions.map((item, idx) => (
                        <li key={`${item.lat}-${item.lng}-${idx}`}>
                          <button
                            type="button"
                            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#f3f7ff]"
                            onClick={() => selectDestination(item)}
                          >
                            <LuMapPin className="mt-1 shrink-0 text-[#3b63a8]" size={15} />
                            <span className="block min-w-0">
                              <span className="block truncate text-sm font-semibold text-[#16326d]">{item.name}</span>
                              <span className="block truncate text-xs text-[#637da9]">{item.address}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {loadingDestinationSearch && <p className="pt-1 text-xs text-[#617aab]">{t("routes.searching")}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-[#c8d6ef] bg-white px-3 py-2 text-xs font-semibold text-[#1a3b7a] hover:bg-[#f3f7ff]"
                    onClick={() => {
                      const oldOrigin = origin;
                      setOrigin(destination);
                      setDestination(oldOrigin);
                      setOriginInput(destination?.name || "");
                      setDestinationInput(oldOrigin?.name || "");
                      clearRouteResult();
                    }}
                    title={t("routes.swap")}
                    aria-label={t("routes.swap")}
                  >
                    <span className="inline-flex items-center gap-1">
                      <LuArrowUpDown size={14} />
                      {t("routes.swap")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold ${pickMode === "destination" ? "border-[#1d4ed8] bg-[#eaf1ff] text-[#1c3f81]" : "border-[#c8d6ef] bg-white text-[#1a3b7a] hover:bg-[#f3f7ff]"}`}
                    onClick={() => setPickMode((prev) => (prev === "destination" ? null : "destination"))}
                  >
                    {t("routes.pickDestinationOnMap")}
                  </button>
                </div>

                <button
                  type="button"
                  className="w-full rounded-xl bg-[#1f4fa0] px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  disabled={!origin || !destination || loadingRoute}
                  onClick={calculateRoute}
                >
                  {loadingRoute ? t("routes.calculating") : t("routes.calculateRoute")}
                </button>

                <div className="rounded-xl border border-[#d8e4f7] bg-[#f7fbff] p-2">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#4a6599]">
                    {t("routes.fuelForComparison")}
                  </label>
                  <select
                    className="w-full rounded-lg border border-[#c8d8f2] bg-white px-2 py-2 text-sm text-[#1f3f79]"
                    value={selectedFuel}
                    onChange={(e) => {
                      setSelectedFuel(e.target.value as CombustibleTipo);
                      clearRouteResult();
                    }}
                  >
                    {fuelOptions.map((fuel) => (
                      <option key={fuel.value} value={fuel.value}>
                        {t(fuel.i18nKey)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-[#d8e4f7] bg-[#f7fbff] p-2">
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#4a6599]">
                      {t("routes.maxDetourKm", { defaultValue: "Desvío máximo (km)" })}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      step={1}
                      className="w-full rounded-lg border border-[#c8d8f2] bg-white px-2 py-2 text-sm text-[#1f3f79]"
                      value={maxDetourKm}
                      onChange={(e) => {
                        setMaxDetourKm(Number(e.target.value) || 1);
                        clearRouteResult();
                      }}
                    />
                  </div>

                  <div className="rounded-xl border border-[#d8e4f7] bg-[#f7fbff] p-2">
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#4a6599]">
                      {t("routes.maxDetourMin", { defaultValue: "Desvío máximo (min)" })}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={1}
                      className="w-full rounded-lg border border-[#c8d8f2] bg-white px-2 py-2 text-sm text-[#1f3f79]"
                      value={maxDetourMin}
                      onChange={(e) => {
                        setMaxDetourMin(Number(e.target.value) || 1);
                        clearRouteResult();
                      }}
                    />
                    <p className="mt-1 text-xs font-semibold text-[#1f3f79]">
                      {maxDetourMin} {t("routes.minutes")}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#d8e4f7] bg-[#f7fbff] p-2">
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#4a6599]">
                      {t("routes.resultLimit", { defaultValue: "Máx. gasolineras" })}
                    </label>
                    <select
                      className="w-full rounded-lg border border-[#c8d8f2] bg-white px-2 py-2 text-sm text-[#1f3f79]"
                      value={resultLimit}
                      onChange={(e) => {
                        setResultLimit(Number(e.target.value));
                        clearRouteResult();
                      }}
                    >
                      {[10, 20, 30, 50, 80].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 rounded-xl border border-[#d8e4f7] bg-[#f7fbff] px-3 py-2 text-sm font-semibold text-[#1f427f]">
                  <input
                    type="checkbox"
                    checked={avoidTolls}
                    onChange={(e) => {
                      setAvoidTolls(e.target.checked);
                      clearRouteResult();
                    }}
                  />
                  {t("routes.avoidTolls", { defaultValue: "Evitar peajes" })}
                </label>

                <button
                  type="button"
                  className="w-full rounded-xl border border-[#c7d8f8] bg-[#edf4ff] px-3 py-2 text-sm font-semibold text-[#1f427f] disabled:opacity-60"
                  onClick={startNavigationInGoogleMaps}
                  disabled={!origin || !destination}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <LuNavigation size={14} />
                    {selectedStop
                      ? t("routes.openInGoogleWithStop", { defaultValue: "Iniciar ruta con parada" })
                      : t("routes.openInGoogle", { defaultValue: "Iniciar ruta" })}
                  </span>
                </button>

                {pickMode && (
                  <p className="rounded-lg border border-dashed border-[#9eb7e4] bg-[#edf4ff] px-2 py-1.5 text-xs text-[#355286]">
                    {pickMode === "origin" ? t("routes.mapPickOriginHint") : t("routes.mapPickDestinationHint")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={isTouchDevice
                ? "fixed bottom-[5.75rem] right-5 inline-flex items-center gap-2 rounded-full border border-[#cddaf1] bg-white px-4 py-3 text-sm font-semibold text-[#16356f] shadow-xl"
                : "inline-flex items-center gap-2 rounded-full border border-[#cddaf1] bg-white/95 px-4 py-2 text-sm font-semibold text-[#16356f] shadow-lg"}
              onClick={() => setShowSearchPanel(true)}
            >
              <LuPencil size={15} />
              {isTouchDevice ? t("routes.editSearch", { defaultValue: "Filtros y ruta" }) : t("routes.editSearch", { defaultValue: "Editar búsqueda" })}
            </button>
          )}
        </div>
      </section>

      {routeError && (
        <div className="absolute left-3 right-3 top-24 z-[1200] rounded-xl border border-[#ffd1d8] bg-[#fff0f0] px-3 py-2 text-sm text-[#b42234] md:left-auto md:right-5 md:top-20 md:w-[420px]" role="alert">
          {routeError}
        </div>
      )}

      {routeInfo && (
        <section className="pointer-events-none absolute bottom-[5.5rem] left-0 right-0 z-40 p-2 md:left-auto md:right-5 md:top-24 md:w-[430px] md:bottom-auto md:p-0">
          <div className="pointer-events-auto rounded-t-3xl border border-[#cad8ef] bg-white/97 p-3 shadow-[0_-14px_40px_rgba(30,58,138,.16)] md:rounded-2xl">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#edf4ff] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#5573a7]">{t("routes.distance")}</p>
                <p className="text-lg font-extrabold text-[#17396f]">{routeInfo.distanceKm.toFixed(1)} km</p>
              </div>
              <div className="rounded-xl bg-[#edf4ff] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#5573a7]">{t("routes.duration")}</p>
                <p className="text-lg font-extrabold text-[#17396f]">{Math.round(routeInfo.durationMin)} {t("routes.minutes")}</p>
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#4d638e]">{t("routes.stopOptions")}</h3>
              <span className="text-[11px] font-semibold text-[#5573a7]">
                {t("routes.candidatesCount", {
                  defaultValue: "{{count}} candidatas",
                  count: gasStationsNearRoute.length,
                })}
              </span>
            </div>
            <div className="mb-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {candidateStops.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left ${selectedStop?.id === station.id ? "border-[#1d4ed8] bg-[#eef4ff]" : "border-[#d5e2f7] bg-white"}`}
                  onClick={() => setSelectedStop(station)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#12316a]">{station.nombre}</p>
                      <p className="truncate text-xs text-[#6782b0]">{station.municipio} {station.provincia ? `· ${station.provincia}` : ""}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-[#f3ecff] px-2 py-0.5 text-[11px] font-semibold text-[#6b21a8]">
                        #{station.posicion}
                      </span>
                      <span className="rounded-full bg-[#e7efff] px-2 py-0.5 text-[11px] font-semibold text-[#1f4fa0]" title={t("routes.progressOnRoute", { defaultValue: "Progreso sobre la ruta" })}>
                        {Math.round(station.porcentaje_ruta)}% {t("routes.routeShort", { defaultValue: "ruta" })}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#23467f]">€{station.precio_litro.toFixed(3)} · +{station.desvio_km.toFixed(1)} km · +{Math.round(station.desvio_min_estimado)} min</p>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="mb-3 w-full rounded-xl bg-[#1f4fa0] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              onClick={startNavigationInGoogleMaps}
              disabled={!origin || !destination}
            >
              <span className="inline-flex items-center gap-1.5">
                <LuNavigation size={15} />
                {selectedStop
                  ? t("routes.openInGoogleWithStop", { defaultValue: "Iniciar ruta con parada" })
                  : t("routes.openInGoogle", { defaultValue: "Iniciar ruta" })}
              </span>
            </button>

            {selectedStop && (
              <article className="rounded-xl border border-[#cad9f3] bg-[#f8fbff] p-3">
                <p className="text-base font-extrabold text-[#0f2f67]">{selectedStop.nombre}</p>
                <p className="text-sm text-[#4c6698]">{selectedStop.direccion}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <p className="text-[11px] text-[#6a84b1]">€/L</p>
                    <p className="text-sm font-bold text-[#17386f]">{selectedStop.precio_litro.toFixed(3)}</p>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <p className="text-[11px] text-[#6a84b1]">+km</p>
                    <p className="text-sm font-bold text-[#17386f]">{selectedStop.desvio_km.toFixed(1)}</p>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1.5">
                    <p className="text-[11px] text-[#6a84b1]">{t("routes.extraMinutes")}</p>
                    <p className="text-sm font-bold text-[#17386f]">{selectedStop.desvio_min_estimado.toFixed(0)}</p>
                  </div>
                </div>
              </article>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
