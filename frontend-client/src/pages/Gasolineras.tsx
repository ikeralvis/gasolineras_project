import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import GasolinerasTable from "../components/GasolinerasTable";
import { getGasolinerasCerca } from "../api/gasolineras";
import { useAuth } from "../contexts/AuthContext";

const MARCAS_POPULARES = [
    { nombre: "Repsol",   color: "#D32F2F" },
    { nombre: "Cepsa",    color: "#0050AC" },
    { nombre: "BP",       color: "#007A33" },
    { nombre: "Shell",    color: "#FBBB00" },
    { nombre: "Galp",     color: "#FF6B00" },
    { nombre: "Petronor", color: "#1A1A1A" },
    { nombre: "Eroski",   color: "#C41E3A" },
    { nombre: "Costco",   color: "#004F9E" },
];

const GASOLINERAS_CACHE_KEY = "gasolineras:list:v1";
const CACHE_MAX_AGE_MS = 8 * 60 * 1000;

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value.replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const toRadians = (value: number) => (value * Math.PI) / 180;
const calcDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const r = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeGasolinera = (g: any) => {
    const rotulo = g?.["Rótulo"] ?? g?.Rotulo ?? "";
    const direccion = g?.["Dirección"] ?? g?.Direccion ?? "";
    return {
        ...g,
        "Rótulo": asText(rotulo),
        Rotulo: asText(rotulo),
        "Dirección": asText(direccion),
        Direccion: asText(direccion),
        Provincia: asText(g?.Provincia),
        Municipio: asText(g?.Municipio),
    };
};

export default function Gasolineras() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [gasolineras, setGasolineras] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
    const [radioKm, setRadioKm] = useState(50);
    const [usarCercania, setUsarCercania] = useState(false);
    const [baseRadioKm, setBaseRadioKm] = useState<number | null>(null);

    const [provincia, setProvincia] = useState("");
    const [municipio, setMunicipio] = useState("");
    const [nombre, setNombre] = useState("");
    const [precioMax, setPrecioMax] = useState("");
    const [marcasSeleccionadas, setMarcasSeleccionadas] = useState<string[]>([]);
    const [soloConPrecio, setSoloConPrecio] = useState(true);

    // Modal de filtros (cerrado por defecto)
    const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

    const [combustibleSeleccionado, setCombustibleSeleccionado] = useState<string>(
        user?.combustible_favorito || "Precio Gasolina 95 E5"
    );
    const [ordenAsc, setOrdenAsc] = useState(true);
    const [modoOrden, setModoOrden] = useState<"price" | "proximity">("price");

    useEffect(() => {
        if (user?.combustible_favorito) setCombustibleSeleccionado(user.combustible_favorito);
    }, [user]);

    const [showProvinciaDropdown, setShowProvinciaDropdown] = useState(false);
    const [showMunicipioDropdown, setShowMunicipioDropdown] = useState(false);

    const provinciasUnicas = [...new Set(gasolineras.map(g => asText(g.Provincia)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const municipiosUnicas = [...new Set(
        gasolineras
            .filter(g => !provincia || asText(g.Provincia).toLowerCase().includes(provincia.toLowerCase()))
            .map(g => asText(g.Municipio))
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    const getDistanceKm = (g: any): number | null => {
        const direct = asNumber(g?.distancia_km);
        if (direct !== null) return direct;
        if (!userLocation) return null;
        const lat = asNumber(g?.Latitud ?? g?.latitud);
        const lon = asNumber(g?.Longitud ?? g?.longitud);
        if (lat === null || lon === null) return null;
        return calcDistanceKm(userLocation.lat, userLocation.lon, lat, lon);
    };

    const cargarTodasLasGasolineras = async () => {
        const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
        const res = await fetch(`${apiBase}/api/gasolineras`);
        const data = await res.json();
        const gasolinerasData = Array.isArray(data.gasolineras)
            ? data.gasolineras.map((g: any) => normalizeGasolinera(g))
            : [];
        setGasolineras(gasolinerasData);
        setFiltered(gasolinerasData);
        setBaseRadioKm(null);
        setModoOrden("price");
        setLoading(false);
        sessionStorage.setItem(GASOLINERAS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: gasolinerasData, sortMode: "price" }));
    };

    const cargarGasolinerasCerca = async (lat: number, lon: number, km: number) => {
        const cerca = await getGasolinerasCerca(lat, lon, km);
        const cercaNormalizadas = cerca.map((g) => normalizeGasolinera(g));
        setGasolineras(cercaNormalizadas);
        setFiltered(cercaNormalizadas);
        setBaseRadioKm(km);
        setModoOrden("proximity");
        setLoading(false);
        sessionStorage.setItem(GASOLINERAS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: cercaNormalizadas, sortMode: "proximity" }));
    };

    const solicitarUbicacion = (onSuccess?: (lat: number, lon: number) => void) => {
        if (!navigator.geolocation) {
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setUserLocation({ lat, lon });
                onSuccess?.(lat, lon);
            },
            () => {
                setUsarCercania(false);
            },
            { timeout: 5000 }
        );
    };

    useEffect(() => {
        async function cargarDatos() {
            try {
                let hasCache = false;
                try {
                    const cachedRaw = sessionStorage.getItem(GASOLINERAS_CACHE_KEY);
                    if (cachedRaw) {
                        const cached = JSON.parse(cachedRaw) as { ts: number; data: any[]; sortMode?: "price" | "proximity"; ordenadoPorCercania?: boolean };
                        if (Date.now() - cached.ts < CACHE_MAX_AGE_MS && Array.isArray(cached.data) && cached.data.length > 0) {
                            hasCache = true;
                            setGasolineras(cached.data);
                            setFiltered(cached.data);
                            const cachedMode = cached.sortMode ?? (cached.ordenadoPorCercania ? "proximity" : "price");
                            setModoOrden(cachedMode);
                            setLoading(false);
                        }
                    }
                } catch { /* ignore cache errors */ }

                if (!hasCache) setLoading(true);

                const geoTimeout = setTimeout(cargarTodasLasGasolineras, 5000);

                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        clearTimeout(geoTimeout);
                        const lat = pos.coords.latitude;
                        const lon = pos.coords.longitude;
                        setUserLocation({ lat, lon });
                        setUsarCercania(true);
                        await cargarGasolinerasCerca(lat, lon, radioKm);
                    },
                    async () => { clearTimeout(geoTimeout); cargarTodasLasGasolineras(); },
                    { timeout: 5000 }
                );
            } catch {
                setLoading(false);
            }
        }
        cargarDatos();
    }, []);

    useEffect(() => {
        const handleClickOutside = () => {
            setShowProvinciaDropdown(false);
            setShowMunicipioDropdown(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        let resultado = [...gasolineras];
        if (provincia.trim()) resultado = resultado.filter(g => asText(g.Provincia).toLowerCase().includes(provincia.toLowerCase()));
        if (municipio.trim()) resultado = resultado.filter(g => asText(g.Municipio).toLowerCase().includes(municipio.toLowerCase()));
        if (nombre.trim()) resultado = resultado.filter(g => asText(g["Rótulo"] ?? g.Rotulo).toLowerCase().includes(nombre.toLowerCase()));
        if (marcasSeleccionadas.length > 0) resultado = resultado.filter(g => marcasSeleccionadas.some(m => asText(g["Rótulo"] ?? g.Rotulo).toLowerCase().includes(m.toLowerCase())));
        if (precioMax.trim()) {
            const maxP = Number.parseFloat(precioMax);
            if (!Number.isNaN(maxP)) resultado = resultado.filter(g => { const p = Number.parseFloat(g[combustibleSeleccionado]?.replace(",", ".") || "999"); return !Number.isNaN(p) && p <= maxP; });
        }
        if (soloConPrecio) resultado = resultado.filter(g => { const p = g[combustibleSeleccionado]; if (!p) return false; const n = Number.parseFloat(p.replace(",", ".")); return !Number.isNaN(n) && n > 0; });
        if (usarCercania && userLocation) {
            resultado = resultado.filter((g) => {
                const dist = getDistanceKm(g);
                return dist !== null && dist <= radioKm;
            });
        }

        if (modoOrden === "price") {
            resultado = [...resultado].sort((a, b) => {
                const pA = Number.parseFloat(a[combustibleSeleccionado]?.replace(",", ".") || "999");
                const pB = Number.parseFloat(b[combustibleSeleccionado]?.replace(",", ".") || "999");
                return ordenAsc ? pA - pB : pB - pA;
            });
        } else if (modoOrden === "proximity") {
            resultado = [...resultado].sort((a, b) => {
                const dA = getDistanceKm(a);
                const dB = getDistanceKm(b);
                if (dA === null && dB === null) return 0;
                if (dA === null) return 1;
                if (dB === null) return -1;
                return dA - dB;
            });
        }

        setFiltered(resultado);
    }, [provincia, municipio, nombre, precioMax, combustibleSeleccionado, gasolineras, marcasSeleccionadas, soloConPrecio, usarCercania, userLocation, radioKm, modoOrden, ordenAsc]);

    useEffect(() => {
        if (!usarCercania || !userLocation) return;
        if (baseRadioKm !== null && radioKm > baseRadioKm) {
            setLoading(true);
            cargarGasolinerasCerca(userLocation.lat, userLocation.lon, radioKm);
        }
    }, [usarCercania, userLocation, radioKm, baseRadioKm]);

    const ordenarPorPrecio = () => {
        setModoOrden("price");
        setOrdenAsc((prev) => !prev);
    };

    const ordenarPorCercania = () => {
        if (!userLocation) {
            solicitarUbicacion((lat, lon) => {
                setUsarCercania(true);
                cargarGasolinerasCerca(lat, lon, radioKm);
            });
            return;
        }
        setUsarCercania(true);
        setModoOrden("proximity");
    };

    const limpiarFiltros = () => {
        setProvincia(""); setMunicipio(""); setNombre(""); setPrecioMax("");
        setMarcasSeleccionadas([]); setSoloConPrecio(true);
        setUsarCercania(false);
        setRadioKm(50);
        if (baseRadioKm !== null) {
            setLoading(true);
            cargarTodasLasGasolineras();
        }
    };

    const toggleMarca = (marca: string) => {
        setMarcasSeleccionadas(prev => prev.includes(marca) ? prev.filter(m => m !== marca) : [...prev, marca]);
    };

    const activeFiltersCount = [provincia, municipio, nombre, precioMax].filter(Boolean).length + marcasSeleccionadas.length + (usarCercania ? 1 : 0);

    const renderTableContent = () => {
        if (loading) {
            return (
                <div className="text-center py-12">
                    <div className="space-y-3 animate-pulse">
                        <div className="mx-auto h-4 w-56 rounded-full bg-[#DCE0FF]" />
                        <div className="mx-auto h-3 w-40 rounded-full bg-[#E8EBFF]" />
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
                            {["a", "b", "c", "d"].map(k => <div key={k} className="h-20 rounded-xl border border-[#D9DBF2] bg-white/80" />)}
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-4">{t('gasStations.loadingStations')}</p>
                </div>
            );
        }
        if (filtered.length === 0) {
            return (
                <div className="text-center py-12">
                    <p className="text-lg text-gray-600">{t('gasStations.noStationsWithFuel', { fuel: combustibleSeleccionado.replace("Precio ", "") })}</p>
                </div>
            );
        }
        return <GasolinerasTable gasolineras={filtered} combustibleSeleccionado={combustibleSeleccionado} />;
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">

            {/* TÍTULO + VER FAVORITAS */}
            <div className="mb-4 md:mb-5 flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-[#0f172a] mb-1 tracking-tight">
                        {t('gasStations.title')}
                    </h1>
                    <p className="text-sm md:text-base text-gray-500">
                        {t('gasStations.subtitle')}
                    </p>
                </div>
                <Link
                    to="/favoritos"
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all whitespace-nowrap"
                >
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                    <span className="hidden sm:inline">Tus favoritas</span>
                    <span className="sm:hidden">Favoritas</span>
                </Link>
            </div>

            {/* BARRA DE CONTROL */}
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-3 mb-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                            {filtered.length} {t('gasStations.foundStations')}
                        </span>
                        <span className="text-xs font-semibold text-[#000C74] bg-[#EEF0FF] px-2.5 py-1 rounded-full">
                            {combustibleSeleccionado.replace("Precio ", "")}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setFiltrosAbiertos(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            {t('common.filter')}
                            {activeFiltersCount > 0 && (
                                <span className="ml-0.5 px-1.5 py-0.5 bg-[#000C74] text-white text-[10px] font-semibold rounded-full leading-none">
                                    {activeFiltersCount}
                                </span>
                            )}
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={ordenarPorPrecio}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                                    modoOrden === "price"
                                        ? "bg-gray-900 text-white shadow-sm"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                                {t('gasStations.sortByPrice')} {modoOrden === "price" ? (ordenAsc ? "↑" : "↓") : ""}
                            </button>

                            <button
                                type="button"
                                onClick={ordenarPorCercania}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                                    modoOrden === "proximity"
                                        ? "bg-[#000C74] text-white shadow-sm"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                                title={userLocation ? t('gasStations.sortByProximity') : t('gasStations.sortByProximityDisabled')}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                {t('gasStations.sortByProximity')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* LISTA */}
            {renderTableContent()}

            {/* ── MODAL DE FILTROS ── */}
            {filtrosAbiertos && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
                        onClick={() => setFiltrosAbiertos(false)}
                    />

                    {/* Panel – bottom sheet en móvil, modal centrado en desktop */}
                    <div className="fixed bottom-0 left-0 right-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl z-50 flex flex-col max-h-[88dvh] md:max-h-[82vh] overflow-hidden">

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                <h3 className="font-semibold text-gray-900">{t('common.filter')}</h3>
                                {activeFiltersCount > 0 && (
                                    <span className="px-2 py-0.5 bg-[#000C74] text-white text-xs font-semibold rounded-full">
                                        {activeFiltersCount}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {activeFiltersCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={limpiarFiltros}
                                        className="text-sm text-gray-500 hover:text-gray-800 font-medium transition"
                                    >
                                        {t('gasStations.clearFilters')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setFiltrosAbiertos(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
                                    aria-label={t('common.close')}
                                >
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Body – scrollable */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">

                            {/* COMBUSTIBLE */}
                            <div>
                                <label htmlFor="combustible-select" className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    {t('filter.fuelType')}
                                </label>
                                <select
                                    id="combustible-select"
                                    value={combustibleSeleccionado}
                                    onChange={(e) => setCombustibleSeleccionado(e.target.value)}
                                    className="w-full border border-gray-300 focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-3 outline-none transition bg-white font-medium text-gray-900"
                                >
                                    <option value="Precio Gasolina 95 E5">{t('fuel.gasoline95')}</option>
                                    <option value="Precio Gasolina 98 E5">{t('fuel.gasoline98')}</option>
                                    <option value="Precio Gasoleo A">{t('fuel.dieselA')}</option>
                                    <option value="Precio Gasoleo B">{t('fuel.dieselB')}</option>
                                    <option value="Precio Gasoleo Premium">{t('fuel.dieselPremium')}</option>
                                </select>
                            </div>

                            {/* CERCANIA */}
                            <div className="rounded-xl border border-[#E5E7F9] bg-[#FCFCFF] p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                    <p className="text-sm font-semibold text-gray-700">{t('gasStations.nearbyFilter')}</p>
                                    <label className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                                        <input
                                            type="checkbox"
                                            checked={usarCercania}
                                            onChange={(e) => {
                                                const next = e.target.checked;
                                                setUsarCercania(next);
                                                if (next) {
                                                    if (userLocation) {
                                                        setModoOrden("proximity");
                                                    } else {
                                                        solicitarUbicacion((lat, lon) => {
                                                            setUsarCercania(true);
                                                            setModoOrden("proximity");
                                                            cargarGasolinerasCerca(lat, lon, radioKm);
                                                        });
                                                    }
                                                } else if (baseRadioKm !== null) {
                                                    setLoading(true);
                                                    cargarTodasLasGasolineras();
                                                }
                                            }}
                                            className="w-4 h-4 text-[#000C74] rounded border-gray-300 focus:ring-[#000C74]"
                                        />
                                        {t('gasStations.useNearby')}
                                    </label>
                                </div>

                                <div className={`grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3 ${!usarCercania ? "opacity-50" : ""}`}>
                                    <div>
                                        <label htmlFor="radio-range" className="block text-xs font-semibold text-gray-500 mb-1">
                                            {t('gasStations.radiusKm')}
                                        </label>
                                        <input
                                            id="radio-range"
                                            type="range"
                                            min={5}
                                            max={200}
                                            step={5}
                                            value={radioKm}
                                            onChange={(e) => setRadioKm(Number(e.target.value))}
                                            disabled={!usarCercania}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="radio-input" className="block text-xs font-semibold text-gray-500 mb-1">
                                            km
                                        </label>
                                        <input
                                            id="radio-input"
                                            type="number"
                                            min={1}
                                            max={200}
                                            step={1}
                                            value={radioKm}
                                            onChange={(e) => setRadioKm(Number(e.target.value))}
                                            disabled={!usarCercania}
                                            className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-3 py-2 outline-none transition"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                                    <button
                                        type="button"
                                        onClick={() => solicitarUbicacion((lat, lon) => {
                                            setUsarCercania(true);
                                            setModoOrden("proximity");
                                            cargarGasolinerasCerca(lat, lon, radioKm);
                                        })}
                                        className="text-xs font-semibold text-[#000C74] border border-[#D7DBFF] px-3 py-1.5 rounded-lg hover:bg-[#EEF0FF] transition"
                                    >
                                        {t('gasStations.useLocation')}
                                    </button>
                                    <span className="text-xs text-gray-500">
                                        {userLocation ? t('gasStations.locationReady') : t('gasStations.locationMissing')}
                                    </span>
                                </div>
                            </div>

                            {/* PROVINCIA + MUNICIPIO */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="relative">
                                    <label htmlFor="provincia" className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('filter.province')}
                                    </label>
                                    <input
                                        id="provincia"
                                        type="text"
                                        placeholder={t('gasStations.provincePlaceholder')}
                                        value={provincia}
                                        onChange={(e) => { setProvincia(e.target.value); setShowProvinciaDropdown(true); }}
                                        onFocus={() => setShowProvinciaDropdown(true)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                                        autoComplete="off"
                                    />
                                    {showProvinciaDropdown && provincia && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                            {provinciasUnicas.filter(p => p.toLowerCase().includes(provincia.toLowerCase())).slice(0, 8).map(prov => (
                                                <button key={prov} type="button" onClick={() => { setProvincia(prov); setShowProvinciaDropdown(false); }} className="w-full text-left px-4 py-2.5 hover:bg-[#F8F9FF] transition-colors text-sm">
                                                    {prov}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <label htmlFor="municipio" className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('filter.municipality')}
                                    </label>
                                    <input
                                        id="municipio"
                                        type="text"
                                        placeholder={t('gasStations.municipalityPlaceholder')}
                                        value={municipio}
                                        onChange={(e) => { setMunicipio(e.target.value); setShowMunicipioDropdown(true); }}
                                        onFocus={() => setShowMunicipioDropdown(true)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                                        autoComplete="off"
                                    />
                                    {showMunicipioDropdown && municipio && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                            {municipiosUnicas.filter(m => m.toLowerCase().includes(municipio.toLowerCase())).slice(0, 8).map(muni => (
                                                <button key={muni} type="button" onClick={() => { setMunicipio(muni); setShowMunicipioDropdown(false); }} className="w-full text-left px-4 py-2.5 hover:bg-[#F8F9FF] transition-colors text-sm">
                                                    {muni}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* NOMBRE + PRECIO MÁX */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('filter.brandName')}
                                    </label>
                                    <input
                                        id="nombre"
                                        type="text"
                                        placeholder={t('gasStations.brandPlaceholder')}
                                        value={nombre}
                                        onChange={(e) => setNombre(e.target.value)}
                                        className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="precioMax" className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('gasStations.maxPrice')}
                                    </label>
                                    <input
                                        id="precioMax"
                                        type="number"
                                        step="0.01"
                                        placeholder={t('gasStations.maxPricePlaceholder')}
                                        value={precioMax}
                                        onChange={(e) => setPrecioMax(e.target.value)}
                                        className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                                    />
                                </div>
                            </div>

                            {/* MARCAS */}
                            <div>
                                <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    {t('gasStations.filterByBrand')}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {MARCAS_POPULARES.map((marca) => {
                                        const selected = marcasSeleccionadas.includes(marca.nombre);
                                        return (
                                            <button
                                                key={marca.nombre}
                                                type="button"
                                                onClick={() => toggleMarca(marca.nombre)}
                                                aria-pressed={selected}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                                    selected
                                                        ? 'bg-[#000C74] text-white shadow-sm'
                                                        : 'bg-white border border-gray-300 text-gray-700 hover:border-[#000C74] hover:text-[#000C74]'
                                                }`}
                                            >
                                                <span
                                                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                                                    style={{ background: selected ? 'rgba(255,255,255,0.6)' : marca.color }}
                                                />
                                                {marca.nombre}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SOLO CON PRECIO */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={soloConPrecio}
                                    onChange={(e) => setSoloConPrecio(e.target.checked)}
                                    className="w-4 h-4 text-[#000C74] rounded border-gray-300 focus:ring-[#000C74]"
                                />
                                <span className="text-sm text-gray-700">{t('gasStations.onlyWithPrice')}</span>
                            </label>
                        </div>

                        {/* Footer – CTA */}
                        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                            <button
                                type="button"
                                onClick={() => setFiltrosAbiertos(false)}
                                className="w-full py-3 bg-[#000C74] text-white rounded-xl font-semibold text-sm hover:bg-[#001A8A] transition"
                            >
                                Ver {filtered.length} {t('nav.gasStations').toLowerCase()}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
