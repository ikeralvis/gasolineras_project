import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { LuMapPin } from "react-icons/lu";
import RouteSearchBox, { LocationOption } from "../components/RouteSearchBox";
import { useRouting } from "../hooks/useRouting";
import "./Rutas.css";

interface RouteLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface GasStation {
  IDEESS: string;
  rotulo: string;
  direccion: string;
  municipio: string;
  lat: number;
  lng: number;
  gasolina95: number | null;
  gasoleoA: number | null;
  distancia_ruta?: number;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export default function Rutas() {
  const { t } = useTranslation();
  const { getRoute, loading: routeLoading, error: routeError } = useRouting();

  const [origin, setOrigin] = useState<RouteLocation | null>(null);
  const [destination, setDestination] = useState<RouteLocation | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [gasStationsNearRoute, setGasStationsNearRoute] = useState<GasStation[]>([]);

  // Crear icono personalizado para marcadores
  const createMarkerIcon = (type: "origin" | "destination" | "station") => {
    const colors: Record<string, string> = {
      origin: "#10b981",
      destination: "#ef4444",
      station: "#f59e0b",
    };

    return L.divIcon({
      html: `<div style="
        background: ${colors[type]};
        border: 3px solid white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-size: 16px;
      ">${
        type === "origin"
          ? "📍"
          : type === "destination"
            ? "🚩"
            : type === "station"
              ? "⛽"
              : ""
      }</div>`,
      className: `marker-icon-${type}`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  };

  const calculateRoute = async () => {
    if (!origin || !destination) return;

    const route = await getRoute(
      {
        name: origin.name,
        address: origin.address,
        lat: origin.lat,
        lng: origin.lng,
      },
      {
        name: destination.name,
        address: destination.address,
        lat: destination.lat,
        lng: destination.lng,
      }
    );

    if (route) {
      // Invertir coordenadas porque Leaflet usa [lat, lng] pero OSRM devuelve [lng, lat]
      const leafletCoords = route.coordinates.map((coord) => [
        coord[1],
        coord[0],
      ]) as [number, number][];
      setRouteCoordinates(leafletCoords);
      setRouteInfo({
        distance: route.distance,
        duration: route.duration,
      });

      // Buscar gasolineras cercanas a la ruta
      // TODO: Implementar búsqueda más inteligente considerando proximidad a la ruta
      fetchGasStationsNearRoute(leafletCoords);
    }
  };

  const fetchGasStationsNearRoute = async (coords: [number, number][]) => {
    try {
      // Calcular bounding box aproximado de la ruta
      const lats = coords.map((c) => c[0]);
      const lngs = coords.map((c) => c[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      // Expandir bbox un 10% para incluir más gasolineras
      const expandFactor = 0.1;
      const latRange = maxLat - minLat;
      const lngRange = maxLng - minLng;

      const response = await fetch(
        `${API_BASE_URL}/api/gasolineras?bbox=${minLat - latRange * expandFactor},${minLng - lngRange * expandFactor},${maxLat + latRange * expandFactor},${maxLng + lngRange * expandFactor}`
      );

      const data = await response.json();
      setGasStationsNearRoute(data.gasolineras || []);
    } catch (error) {
      console.error("Error fetching gas stations:", error);
    }
  };

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setGasStationsNearRoute([]);
  };

  const handleOriginSelect = (location: LocationOption) => {
    setOrigin({
      name: location.name,
      address: location.address,
      lat: location.lat,
      lng: location.lng,
    });
    setRouteCoordinates([]);
    setRouteInfo(null);
    setGasStationsNearRoute([]);
  };

  const handleDestinationSelect = (location: LocationOption) => {
    setDestination({
      name: location.name,
      address: location.address,
      lat: location.lat,
      lng: location.lng,
    });
    setRouteCoordinates([]);
    setRouteInfo(null);
    setGasStationsNearRoute([]);
  };

  // Centro del mapa
  const mapCenter = useMemo(() => {
    if (origin && destination) {
      return [
        (origin.lat + destination.lat) / 2,
        (origin.lng + destination.lng) / 2,
      ] as [number, number];
    }
    if (origin) {
      return [origin.lat, origin.lng] as [number, number];
    }
    return [40.4637, -3.7492] as [number, number]; // Centro de España
  }, [origin, destination]);

  // Calcular zoom automático
  const mapZoom = useMemo(() => {
    if (routeCoordinates.length > 0) return 13;
    if (origin && destination) return 10;
    if (origin) return 12;
    return 6;
  }, [origin, destination, routeCoordinates]);

  return (
    <div className="rutas-container">
      <div className="rutas-header">
        <h1>{t("routes.title")}</h1>
        <p>{t("routes.subtitle")}</p>
      </div>

      <div className="rutas-content">
        <div className="rutas-search-panel">
          <RouteSearchBox
            onOriginSelect={handleOriginSelect}
            onDestinationSelect={handleDestinationSelect}
            onSwap={handleSwap}
            originValue={origin?.name || ""}
            destinationValue={destination?.name || ""}
          />

          <button
            className="rutas-calculate-btn"
            onClick={calculateRoute}
            disabled={!origin || !destination || routeLoading}
            aria-label={t("routes.calculateRoute")}
          >
            {routeLoading ? (
              <>
                <span className="loading-spinner"></span>
                {t("routes.calculating")}
              </>
            ) : (
              <>
                <LuMapPin size={18} aria-hidden="true" />
                {t("routes.calculateRoute")}
              </>
            )}
          </button>

          {routeError && (
            <div className="rutas-error" role="alert">
              {routeError}
            </div>
          )}

          {routeInfo && (
            <div className="rutas-info">
              <div className="info-item">
                <span className="info-label">{t("routes.distance")}:</span>
                <span className="info-value">{(routeInfo.distance / 1000).toFixed(1)} km</span>
              </div>
              <div className="info-item">
                <span className="info-label">{t("routes.duration")}:</span>
                <span className="info-value">
                  {Math.round(routeInfo.duration / 60)} {t("routes.minutes")}
                </span>
              </div>
            </div>
          )}

          {gasStationsNearRoute.length > 0 && (
            <div className="rutas-stations">
              <h3>{t("routes.gasStationsNearRoute")}</h3>
              <div className="stations-list">
                {gasStationsNearRoute.slice(0, 5).map((station) => (
                  <div key={station.IDEESS} className="station-card">
                    <div className="station-header">
                      <h4>{station.rotulo}</h4>
                      <span className="station-distance">
                        {station.distancia_ruta
                          ? `${station.distancia_ruta.toFixed(1)} km`
                          : "–"}
                      </span>
                    </div>
                    <p className="station-address">{station.direccion}</p>
                    <p className="station-location">{station.municipio}</p>
                    <div className="station-prices">
                      {station.gasolina95 !== null && (
                        <div className="price-item">
                          <span className="price-label">95</span>
                          <span className="price-value">€{station.gasolina95.toFixed(3)}</span>
                        </div>
                      )}
                      {station.gasoleoA !== null && (
                        <div className="price-item">
                          <span className="price-label">Diesel</span>
                          <span className="price-value">€{station.gasoleoA.toFixed(3)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rutas-map-panel">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              maxZoom={19}
            />

            {/* Ruta */}
            {routeCoordinates.length > 0 && (
              <Polyline
                positions={routeCoordinates}
                color="#6366f1"
                weight={4}
                opacity={0.8}
                dashArray="5, 5"
              />
            )}

            {/* Marcador Origen */}
            {origin && (
              <Marker
                position={[origin.lat, origin.lng]}
                icon={createMarkerIcon("origin")}
              >
                <Popup>
                  <div className="popup-content">
                    <strong>{origin.name}</strong>
                    <p>{origin.address}</p>
                    <p className="popup-label">{t("routes.starting")} </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Marcador Destino */}
            {destination && (
              <Marker
                position={[destination.lat, destination.lng]}
                icon={createMarkerIcon("destination")}
              >
                <Popup>
                  <div className="popup-content">
                    <strong>{destination.name}</strong>
                    <p>{destination.address}</p>
                    <p className="popup-label">{t("routes.destination")}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Gasolineras */}
            {gasStationsNearRoute.map((station) => (
              <Marker
                key={station.IDEESS}
                position={[station.lat, station.lng]}
                icon={createMarkerIcon("station")}
              >
                <Popup>
                  <div className="popup-content">
                    <strong>{station.rotulo}</strong>
                    <p>{station.direccion}</p>
                    {station.gasolina95 !== null && (
                      <p>95: €{station.gasolina95.toFixed(3)}</p>
                    )}
                    {station.gasoleoA !== null && (
                      <p>Diesel: €{station.gasoleoA.toFixed(3)}</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
