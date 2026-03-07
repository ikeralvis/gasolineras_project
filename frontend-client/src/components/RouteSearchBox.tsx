import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LuMapPin, LuX, LuArrowRight } from "react-icons/lu";
import "./RouteSearchBox.css";

export interface LocationOption {
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: "nominatim" | "geolocation";
}

interface RouteSearchBoxProps {
  onOriginSelect: (location: LocationOption) => void;
  onDestinationSelect: (location: LocationOption) => void;
  onSwap: () => void;
  originValue?: string;
  destinationValue?: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export default function RouteSearchBox({
  onOriginSelect,
  onDestinationSelect,
  onSwap,
  originValue = "",
  destinationValue = "",
}: RouteSearchBoxProps) {
  const { t } = useTranslation();
  const [originInput, setOriginInput] = useState(originValue);
  const [destinationInput, setDestinationInput] = useState(destinationValue);
  const [originSuggestions, setOriginSuggestions] = useState<LocationOption[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<LocationOption[]>([]);
  const [loadingOrigin, setLoadingOrigin] = useState(false);
  const [loadingDest, setLoadingDest] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  const searchLocations = useCallback(async (query: string, isOrigin: boolean) => {
    if (query.length < 3) {
      isOrigin ? setOriginSuggestions([]) : setDestSuggestions([]);
      return;
    }

    isOrigin ? setLoadingOrigin(true) : setLoadingDest(true);

    try {
      const response = await fetch(
        `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=es`
      );
      const data = await response.json();

      const suggestions: LocationOption[] = data.map((result: any) => ({
        name: result.name || result.display_name.split(",")[0],
        address: result.display_name,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        type: "nominatim",
      }));

      isOrigin ? setOriginSuggestions(suggestions) : setDestSuggestions(suggestions);
    } catch (error) {
      console.error("Error searching locations:", error);
    } finally {
      isOrigin ? setLoadingOrigin(false) : setLoadingDest(false);
    }
  }, []);

  const handleOriginChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setOriginInput(value);
      setShowOriginDropdown(true);
      searchLocations(value, true);
    },
    [searchLocations]
  );

  const handleDestinationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDestinationInput(value);
      setShowDestDropdown(true);
      searchLocations(value, false);
    },
    [searchLocations]
  );

  const handleOriginSelect = useCallback(
    (location: LocationOption) => {
      setOriginInput(location.name);
      setShowOriginDropdown(false);
      setOriginSuggestions([]);
      onOriginSelect(location);
    },
    [onOriginSelect]
  );

  const handleDestinationSelect = useCallback(
    (location: LocationOption) => {
      setDestinationInput(location.name);
      setShowDestDropdown(false);
      setDestSuggestions([]);
      onDestinationSelect(location);
    },
    [onDestinationSelect]
  );

  const handleGeolocation = useCallback(
    (isOrigin: boolean) => {
      if (!navigator.geolocation) {
        alert(t("accessibility.geolocationNotSupported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          // Reverse geocode con Nominatim
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const data = await response.json();

            const location: LocationOption = {
              name: data.address?.city || data.address?.town || "Tu ubicación",
              address: data.display_name,
              lat: latitude,
              lng: longitude,
              type: "geolocation",
            };

            if (isOrigin) {
              handleOriginSelect(location);
            } else {
              handleDestinationSelect(location);
            }
          } catch (error) {
            console.error("Error reverse geocoding:", error);
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
          alert(t("accessibility.geolocationError"));
        }
      );
    },
    [t, handleOriginSelect, handleDestinationSelect]
  );

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (originRef.current && !originRef.current.contains(event.target as Node)) {
        setShowOriginDropdown(false);
      }
      if (destRef.current && !destRef.current.contains(event.target as Node)) {
        setShowDestDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, isOrigin: boolean) => {
      if (e.key === "Enter") {
        const suggestions = isOrigin ? originSuggestions : destSuggestions;
        if (suggestions.length > 0) {
          isOrigin
            ? handleOriginSelect(suggestions[0])
            : handleDestinationSelect(suggestions[0]);
        }
      }
    },
    [originSuggestions, destSuggestions, handleOriginSelect, handleDestinationSelect]
  );

  return (
    <div className="route-search-box">
      <div className="route-input-group">
        {/* Origen */}
        <div ref={originRef} className="route-input-wrapper">
          <label htmlFor="origin-input" className="route-label">
            {t("routes.from")}
          </label>
          <div className="route-input-container">
            <LuMapPin className="route-icon" aria-hidden="true" />
            <input
              id="origin-input"
              type="text"
              className="route-input"
              placeholder={t("routes.fromPlaceholder")}
              value={originInput}
              onChange={handleOriginChange}
              onKeyDown={(e) => handleKeyDown(e, true)}
              aria-label={t("routes.from")}
              aria-autocomplete="list"
              aria-expanded={showOriginDropdown}
              aria-controls="origin-suggestions"
            />
            {originInput && (
              <button
                className="route-clear-btn"
                onClick={() => {
                  setOriginInput("");
                  setOriginSuggestions([]);
                }}
                aria-label={t("accessibility.clear")}
              >
                <LuX size={18} />
              </button>
            )}
            <button
              className="route-geolocation-btn"
              onClick={() => handleGeolocation(true)}
              aria-label={t("routes.useCurrentLocation")}
              title={t("routes.useCurrentLocation")}
            >
              📍
            </button>
          </div>

          {showOriginDropdown && originSuggestions.length > 0 && (
            <ul id="origin-suggestions" className="route-suggestions" role="listbox">
              {originSuggestions.map((suggestion, idx) => (
                <li key={idx} role="option">
                  <button
                    className="route-suggestion-item"
                    onClick={() => handleOriginSelect(suggestion)}
                  >
                    <LuMapPin size={16} aria-hidden="true" />
                    <div>
                      <div className="suggestion-name">{suggestion.name}</div>
                      <div className="suggestion-address">{suggestion.address}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loadingOrigin && <div className="route-loading">{t("routes.searching")}</div>}
        </div>

        {/* Botón Swap */}
        <button
          className="route-swap-btn"
          onClick={onSwap}
          aria-label={t("routes.swap")}
          title={t("routes.swap")}
        >
          <LuArrowRight size={20} />
        </button>

        {/* Destino */}
        <div ref={destRef} className="route-input-wrapper">
          <label htmlFor="destination-input" className="route-label">
            {t("routes.to")}
          </label>
          <div className="route-input-container">
            <LuMapPin className="route-icon" aria-hidden="true" />
            <input
              id="destination-input"
              type="text"
              className="route-input"
              placeholder={t("routes.toPlaceholder")}
              value={destinationInput}
              onChange={handleDestinationChange}
              onKeyDown={(e) => handleKeyDown(e, false)}
              aria-label={t("routes.to")}
              aria-autocomplete="list"
              aria-expanded={showDestDropdown}
              aria-controls="destination-suggestions"
            />
            {destinationInput && (
              <button
                className="route-clear-btn"
                onClick={() => {
                  setDestinationInput("");
                  setDestSuggestions([]);
                }}
                aria-label={t("accessibility.clear")}
              >
                <LuX size={18} />
              </button>
            )}
            <button
              className="route-geolocation-btn"
              onClick={() => handleGeolocation(false)}
              aria-label={t("routes.useCurrentLocation")}
              title={t("routes.useCurrentLocation")}
            >
              📍
            </button>
          </div>

          {showDestDropdown && destSuggestions.length > 0 && (
            <ul id="destination-suggestions" className="route-suggestions" role="listbox">
              {destSuggestions.map((suggestion, idx) => (
                <li key={idx} role="option">
                  <button
                    className="route-suggestion-item"
                    onClick={() => handleDestinationSelect(suggestion)}
                  >
                    <LuMapPin size={16} aria-hidden="true" />
                    <div>
                      <div className="suggestion-name">{suggestion.name}</div>
                      <div className="suggestion-address">{suggestion.address}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loadingDest && <div className="route-loading">{t("routes.searching")}</div>}
        </div>
      </div>
    </div>
  );
}
