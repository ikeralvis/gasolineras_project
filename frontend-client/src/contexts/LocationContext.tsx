import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "tankgo:location:v1";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 min

export type UserLocation = { lat: number; lon: number };

type LocationState = {
  location: UserLocation | null;
  loading: boolean;
  error: "unavailable" | "permission_denied" | null;
  refetch: () => void;
};

const LocationContext = createContext<LocationState>({
  location: null,
  loading: false,
  error: null,
  refetch: () => {},
});

function readCache(): UserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { lat, lon, ts } = JSON.parse(raw) as { lat: number; lon: number; ts: number };
    return Date.now() - ts < CACHE_MAX_AGE_MS ? { lat, lon } : null;
  } catch {
    return null;
  }
}

function writeCache(loc: UserLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loc, ts: Date.now() }));
  } catch { /* ignore quota errors */ }
}

export function LocationProvider({ children }: { readonly children: ReactNode }) {
  // Start with cache so components have a position immediately
  const [location, setLocation] = useState<UserLocation | null>(() => readCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LocationState["error"]>(null);
  const fetchingRef = useRef(false);

  function doFetch() {
    if (fetchingRef.current || !navigator.geolocation) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: UserLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setLocation(loc);
        writeCache(loc);
        setLoading(false);
        fetchingRef.current = false;
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? "permission_denied" : "unavailable");
        setLoading(false);
        fetchingRef.current = false;
      },
      {
        enableHighAccuracy: false, // network-based: fast (<1s), accurate enough for ~km radius
        maximumAge: 30_000,        // accept 30s-old cached position → instant on repeat visits
        timeout: 10_000,
      }
    );
  }

  useEffect(() => {
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocationContext.Provider value={{ location, loading, error, refetch: doFetch }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext() {
  return useContext(LocationContext);
}
