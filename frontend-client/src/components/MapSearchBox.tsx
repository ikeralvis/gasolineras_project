import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuSearch, LuX, LuMapPin, LuLoaderCircle } from "react-icons/lu";
import { searchLocations, type GeocodingLocation } from "../api/geocoding";

interface MapSearchBoxProps {
  onSelect: (location: GeocodingLocation) => void;
  className?: string;
}

const DEBOUNCE_MS = 350;

export default function MapSearchBox({ onSelect, className = "" }: Readonly<MapSearchBoxProps>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      setLoading(true);
      try {
        const locations = await searchLocations(trimmed);
        if (seq === requestSeqRef.current) {
          setResults(locations);
          setActiveIndex(-1);
        }
      } catch (err) {
        console.error("Error buscando ubicaciones:", err);
        if (seq === requestSeqRef.current) setResults([]);
      } finally {
        if (seq === requestSeqRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback((location: GeocodingLocation) => {
    setQuery(location.name || location.address);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(location);
  }, [onSelect]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (chosen) handleSelect(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }, [open, results, activeIndex, handleSelect]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="flex items-center bg-white rounded-xl shadow-lg border border-gray-200 px-3 h-11">
        <LuSearch className="text-gray-400 shrink-0" size={17} />
        <input
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={t("map.searchPlaceholder")}
          aria-label={t("map.searchPlaceholder")}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="map-search-suggestions"
          className="flex-1 min-w-0 px-2.5 h-full bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400"
        />
        {loading && <LuLoaderCircle className="animate-spin text-gray-400 shrink-0" size={16} />}
        {!loading && query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("map.searchClear")}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            <LuX size={15} />
          </button>
        )}
      </div>

      {open && query.trim().length >= 3 && !loading && (
        <ul
          id="map-search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-72 overflow-y-auto z-10"
        >
          {results.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-gray-400">{t("map.searchNoResults")}</li>
          ) : (
            results.map((location, idx) => (
              <li key={`${location.lat}-${location.lng}-${idx}`} role="option" aria-selected={idx === activeIndex}>
                <button
                  type="button"
                  onClick={() => handleSelect(location)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition ${idx === activeIndex ? "bg-gray-50" : ""}`}
                >
                  <LuMapPin className="text-[#000C74] mt-0.5 shrink-0" size={15} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{location.name}</div>
                    <div className="text-xs text-gray-500 truncate">{location.address}</div>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
