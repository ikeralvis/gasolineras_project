import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import GasolinerasTable from "../components/GasolinerasTable";
import { getGasolinerasCerca } from "../api/gasolineras";
import { useAuth } from "../contexts/AuthContext";

// Marcas populares para filtro rápido
const MARCAS_POPULARES = [
    { nombre: "Repsol", logo: "🔴" },
    { nombre: "Cepsa", logo: "🔵" },
    { nombre: "BP", logo: "🟢" },
    { nombre: "Shell", logo: "🟡" },
    { nombre: "Galp", logo: "🟠" },
    { nombre: "Petronor", logo: "⚫" },
    { nombre: "Eroski", logo: "🟤" },
    { nombre: "Costco", logo: "🔷" },
];

export default function Gasolineras() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [gasolineras, setGasolineras] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [provincia, setProvincia] = useState("");
    const [municipio, setMunicipio] = useState("");
    const [nombre, setNombre] = useState("");
    const [precioMax, setPrecioMax] = useState("");
    
    // Nuevos filtros avanzados
    const [marcasSeleccionadas, setMarcasSeleccionadas] = useState<string[]>([]);
    const [soloConPrecio, setSoloConPrecio] = useState(true);
    
    // Estado para colapsar/expandir filtros (colapsado por defecto en móvil)
    const [filtrosAbiertos, setFiltrosAbiertos] = useState(window.innerWidth >= 768);
    const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);
    
    // Estado para el tipo de combustible seleccionado
    const [combustibleSeleccionado, setCombustibleSeleccionado] = useState<string>(
        user?.combustible_favorito || "Precio Gasolina 95 E5"
    );

    const [ordenAsc, setOrdenAsc] = useState(true);
    
    // Indica si los datos están ordenados por cercanía
    const [ordenadoPorCercania, setOrdenadoPorCercania] = useState(false);
    
    // Actualizar combustible seleccionado cuando cambie el usuario
    useEffect(() => {
        if (user?.combustible_favorito) {
            setCombustibleSeleccionado(user.combustible_favorito);
        }
    }, [user]);
    
    // Estados para autocomplete
    const [showProvinciaDropdown, setShowProvinciaDropdown] = useState(false);
    const [showMunicipioDropdown, setShowMunicipioDropdown] = useState(false);
    
    // Listas únicas para autocomplete
    const provinciasUnicas = [...new Set(gasolineras.map(g => g.Provincia))].sort((a, b) => a.localeCompare(b));
    const municipiosUnicas = [...new Set(
        gasolineras
            .filter(g => !provincia || g.Provincia.toLowerCase().includes(provincia.toLowerCase()))
            .map(g => g.Municipio)
    )].sort((a, b) => a.localeCompare(b));


    useEffect(() => {
  async function cargarDatos() {
    try {
      console.log("🔄 Iniciando carga de gasolineras...");
      setLoading(true);
      
      // Función para cargar todas las gasolineras (fallback)
      const cargarTodasLasGasolineras = async () => {
        console.log("🔄 Cargando todas las gasolineras...");
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api/gasolineras`);
        const data = await res.json();
        console.log("📦 Respuesta del servidor:", data);
        
        const gasolinerasData = data.gasolineras || [];
        console.log("📊 Total gasolineras cargadas:", gasolinerasData.length);
        
        setGasolineras(gasolinerasData);
        setFiltered(gasolinerasData);
        setOrdenadoPorCercania(false);
        setLoading(false);
      };

      // Timeout de 5 segundos para geolocalización
      const geoTimeout = setTimeout(() => {
        console.log("⏱️ Timeout de geolocalización - cargando todas...");
        cargarTodasLasGasolineras();
      }, 5000);

      // Pedir ubicación
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          clearTimeout(geoTimeout);
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          console.log("📍 Ubicación detectada:", lat, lon);

          const cerca = await getGasolinerasCerca(lat, lon, 50);
          console.log("✅ Gasolineras cercanas recibidas:", cerca.length);
          // Las gasolineras ya vienen ordenadas por distancia desde el backend
          setGasolineras(cerca);
          setFiltered(cerca);
          setOrdenadoPorCercania(true);
          setLoading(false);
        },
        async (error) => {
          clearTimeout(geoTimeout);
          console.log("⚠️ Usuario rechazó ubicación o error:", error.message);
          cargarTodasLasGasolineras();
        },
        { timeout: 5000 } // Timeout para getCurrentPosition
      );
    } catch (error) {
      console.error("❌ Error cargando gasolineras:", error);
      setLoading(false);
    }
  }

  cargarDatos();
}, []);

    // Cerrar dropdowns al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = () => {
            setShowProvinciaDropdown(false);
            setShowMunicipioDropdown(false);
        };
        
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Aplicar filtros automáticamente cuando cambian los valores
    useEffect(() => {
        let resultado = [...gasolineras];

        if (provincia.trim() !== "") {
            resultado = resultado.filter((g) =>
                g.Provincia.toLowerCase().includes(provincia.toLowerCase())
            );
        }

        if (municipio.trim() !== "") {
            resultado = resultado.filter((g) =>
                g.Municipio.toLowerCase().includes(municipio.toLowerCase())
            );
        }

        if (nombre.trim() !== "") {
            resultado = resultado.filter((g) =>
                g["Rótulo"].toLowerCase().includes(nombre.toLowerCase())
            );
        }

        // Filtro por marcas seleccionadas
        if (marcasSeleccionadas.length > 0) {
            resultado = resultado.filter((g) =>
                marcasSeleccionadas.some(marca =>
                    g["Rótulo"].toLowerCase().includes(marca.toLowerCase())
                )
            );
        }

        if (precioMax.trim() !== "") {
            const maxPrecio = Number.parseFloat(precioMax);
            if (!Number.isNaN(maxPrecio)) {
                resultado = resultado.filter((g) => {
                    const precio = Number.parseFloat(g[combustibleSeleccionado]?.replace(",", ".") || "999");
                    return !Number.isNaN(precio) && precio <= maxPrecio;
                });
            }
        }

        // Filtrar gasolineras que tengan precio para el combustible seleccionado
        if (soloConPrecio) {
            resultado = resultado.filter((g) => {
                const precio = g[combustibleSeleccionado];
                if (!precio) return false;
                const precioNum = Number.parseFloat(precio.replace(",", "."));
                return !Number.isNaN(precioNum) && precioNum > 0;
            });
        }

        setFiltered(resultado);
    }, [provincia, municipio, nombre, precioMax, combustibleSeleccionado, gasolineras, marcasSeleccionadas, soloConPrecio]);

    const ordenarPorPrecio = () => {
        const resultado = [...filtered].sort((a, b) => {
            const pA = Number.parseFloat(a[combustibleSeleccionado]?.replace(",", ".") || "999");
            const pB = Number.parseFloat(b[combustibleSeleccionado]?.replace(",", ".") || "999");
            return ordenAsc ? pA - pB : pB - pA;
        });

        setFiltered(resultado);
        setOrdenAsc(!ordenAsc);
        setOrdenadoPorCercania(false);
    };

    const limpiarFiltros = () => {
        setProvincia("");
        setMunicipio("");
        setNombre("");
        setPrecioMax("");
        setMarcasSeleccionadas([]);
        setSoloConPrecio(true);
    };
    
    const toggleMarca = (marca: string) => {
        setMarcasSeleccionadas(prev =>
            prev.includes(marca)
                ? prev.filter(m => m !== marca)
                : [...prev, marca]
        );
    };
    
    const seleccionarProvincia = (prov: string) => {
        setProvincia(prov);
        setShowProvinciaDropdown(false);
    };
    
    const seleccionarMunicipio = (muni: string) => {
        setMunicipio(muni);
        setShowMunicipioDropdown(false);
    };

    const renderTableContent = () => {
        if (loading) {
            return (
                <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[#000C74] border-t-transparent mb-4"></div>
                    <p className="text-lg text-gray-600">{t('gasStations.loadingStations')}</p>
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
        
        return (
            <GasolinerasTable 
                gasolineras={filtered} 
                combustibleSeleccionado={combustibleSeleccionado}
            />
        );
    };


    return (
        <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
            <div className="mb-6">
                <h1 className="text-3xl md:text-4xl font-bold text-[#000C74] mb-2">
                    {t('gasStations.title')}
                </h1>
                <p className="text-gray-600">
                    {t('gasStations.subtitle')}
                </p>
            </div>

            {/* Panel de Filtros con Acordeón */}
            <div className="bg-white shadow-lg border border-[#D9DBF2]/70 rounded-2xl overflow-hidden">
                {/* Cabecera del acordeón - siempre visible */}
                <button
                    type="button"
                    onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
                    className="w-full flex items-center justify-between p-4 md:p-6 hover:bg-gray-50 transition-colors"
                    aria-expanded={filtrosAbiertos}
                    aria-controls="panel-filtros"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#000C74]/10 rounded-lg">
                            <svg className="w-5 h-5 text-[#000C74]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900">{t('common.filter')}</h3>
                            <p className="text-sm text-gray-500 hidden md:block">{t('gasStations.customizeSearch')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Badge de filtros activos */}
                        {(provincia || municipio || nombre || precioMax || marcasSeleccionadas.length > 0) && (
                            <span className="px-2 py-1 bg-[#000C74] text-white text-xs font-medium rounded-full">
                                {[provincia, municipio, nombre, precioMax].filter(Boolean).length + marcasSeleccionadas.length} {t('gasStations.filtersActive')}
                            </span>
                        )}
                        <svg 
                            className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${filtrosAbiertos ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </button>

                {/* Contenido del acordeón */}
                <div 
                    id="panel-filtros"
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${filtrosAbiertos ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                    <div className="p-4 md:p-6 pt-0 border-t border-gray-100">
                        <div className="flex items-center justify-end mb-4">
                            <button
                                onClick={limpiarFiltros}
                                className="text-sm text-[#000C74] hover:text-[#0A128C] font-medium flex items-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                {t('gasStations.clearFilters')}
                            </button>
                        </div>

                        {/* SELECTOR DE COMBUSTIBLE - DESTACADO */}
                        <div className="mb-6 p-4 bg-linear-to-r from-[#000C74]/5 to-[#4A52D9]/5 rounded-xl border-2 border-[#000C74]/20">
                            <label htmlFor="combustible-select" className="text-sm font-bold text-[#000C74] mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                {t('filter.fuelType')}
                            </label>
                            <select
                                id="combustible-select"
                                value={combustibleSeleccionado}
                                onChange={(e) => setCombustibleSeleccionado(e.target.value)}
                                className="w-full border-2 border-[#000C74]/30 focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-3 outline-none transition bg-white font-medium text-gray-900"
                            >
                                <option value="Precio Gasolina 95 E5">{t('fuel.gasoline95')}</option>
                                <option value="Precio Gasolina 98 E5">{t('fuel.gasoline98')}</option>
                                <option value="Precio Gasoleo A">{t('fuel.dieselA')}</option>
                                <option value="Precio Gasoleo B">{t('fuel.dieselB')}</option>
                                <option value="Precio Gasoleo Premium">{t('fuel.dieselPremium')}</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* PROVINCIA CON AUTOCOMPLETE */}
                            <div className="relative">
                                <label htmlFor="provincia" className="block text-sm font-medium text-gray-700 mb-2">
                                    🏙️ {t('filter.province')}
                                </label>
                                <input
                                    id="provincia"
                                    type="text"
                                    placeholder={t('gasStations.provincePlaceholder')}
                                    value={provincia}
                                    onChange={(e) => {
                                        setProvincia(e.target.value);
                                        setShowProvinciaDropdown(true);
                                    }}
                                    onFocus={() => setShowProvinciaDropdown(true)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                                    autoComplete="off"
                                    list="provincias-list"
                                />
                                <datalist id="provincias-list">
                                    {provinciasUnicas.slice(0, 10).map((prov) => (
                                        <option key={prov} value={prov} />
                                    ))}
                                </datalist>
                                
                                {/* Dropdown de provincias */}
                                {showProvinciaDropdown && provincia && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                        {provinciasUnicas
                                            .filter(p => p.toLowerCase().includes(provincia.toLowerCase()))
                                            .slice(0, 10)
                                            .map((prov) => (
                                                <button
                                                    key={prov}
                                                    type="button"
                                                    onClick={() => seleccionarProvincia(prov)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-[#F8F9FF] transition-colors text-sm"
                                                >
                                                    {prov}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>

                            {/* MUNICIPIO CON AUTOCOMPLETE */}
                            <div className="relative">
                                <label htmlFor="municipio" className="block text-sm font-medium text-gray-700 mb-2">
                                    📍 {t('filter.municipality')}
                                </label>
                                <input
                                    id="municipio"
                                    type="text"
                                    placeholder={t('gasStations.municipalityPlaceholder')}
                                    value={municipio}
                                    onChange={(e) => {
                                        setMunicipio(e.target.value);
                                        setShowMunicipioDropdown(true);
                                    }}
                                    onFocus={() => setShowMunicipioDropdown(true)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                                    autoComplete="off"
                                    list="municipios-list"
                                />
                                <datalist id="municipios-list">
                                    {municipiosUnicas.slice(0, 10).map((muni) => (
                                        <option key={muni} value={muni} />
                                    ))}
                                </datalist>
                                
                                {/* Dropdown de municipios */}
                                {showMunicipioDropdown && municipio && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                        {municipiosUnicas
                                            .filter(m => m.toLowerCase().includes(municipio.toLowerCase()))
                                            .slice(0, 10)
                                            .map((muni) => (
                                                <button
                                                    key={muni}
                                                    type="button"
                                                    onClick={() => seleccionarMunicipio(muni)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-[#F8F9FF] transition-colors text-sm"
                                                >
                                                    {muni}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-2">
                                    🏢 {t('filter.brandName')}
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
                                    💰 {t('gasStations.maxPrice')}
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

                        {/* Botón para mostrar filtros avanzados */}
                        <button
                            type="button"
                            onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
                            className="mt-4 flex items-center gap-2 text-sm font-medium text-[#000C74] hover:text-[#0A128C] transition"
                            aria-expanded={mostrarFiltrosAvanzados}
                        >
                            <svg 
                                className={`w-4 h-4 transition-transform ${mostrarFiltrosAvanzados ? 'rotate-180' : ''}`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            {mostrarFiltrosAvanzados ? t('gasStations.hideAdvancedFilters') : t('gasStations.showAdvancedFilters')}
                        </button>

                        {/* Filtros avanzados */}
                        {mostrarFiltrosAvanzados && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                {/* Filtro por marcas */}
                                <div className="mb-4">
                                    <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                        {t('gasStations.filterByBrand')}
                                    </p>
                                    <fieldset className="flex flex-wrap gap-2">
                                        <legend className="sr-only">{t('gasStations.filterByBrand')}</legend>
                                        {MARCAS_POPULARES.map((marca) => (
                                            <button
                                                key={marca.nombre}
                                                type="button"
                                                onClick={() => toggleMarca(marca.nombre)}
                                                aria-pressed={marcasSeleccionadas.includes(marca.nombre)}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                                    marcasSeleccionadas.includes(marca.nombre)
                                                        ? 'bg-[#000C74] text-white shadow-md'
                                                        : 'bg-white border border-gray-300 text-gray-700 hover:border-[#000C74] hover:text-[#000C74]'
                                                }`}
                                            >
                                                {marca.logo} {marca.nombre}
                                            </button>
                                        ))}
                                    </fieldset>
                                </div>

                                {/* Opciones adicionales */}
                                <div className="flex flex-wrap gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={soloConPrecio}
                                            onChange={(e) => setSoloConPrecio(e.target.checked)}
                                            className="w-4 h-4 text-[#000C74] rounded border-gray-300 focus:ring-[#000C74]"
                                        />
                                        <span className="text-sm text-gray-700">{t('gasStations.onlyWithPrice')}</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Barra de información y ordenación - Rediseñada con mejor separación */}
            <div className="bg-white shadow-md border border-gray-200 rounded-xl p-4 mt-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-[#000C74] bg-[#000C74]/10 px-3 py-2 rounded-lg">
                            ⛽ {combustibleSeleccionado.replace("Precio ", "")}
                        </span>
                        <span className="text-sm text-gray-600 font-medium">
                            {filtered.length} {t('gasStations.foundStations')}
                        </span>
                        {ordenadoPorCercania && (
                            <span className="text-xs text-green-700 bg-green-100 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 font-medium">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                {t('gasStations.orderedByProximity')}
                            </span>
                        )}
                    </div>
                    <button
                        className="w-full sm:w-auto px-5 py-2.5 bg-[#000C74] text-white rounded-xl hover:bg-[#0A128C] transition shadow-md font-medium flex items-center justify-center gap-2 text-sm"
                        onClick={ordenarPorPrecio}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        {t('gasStations.sortByPrice')} {ordenAsc ? "↑" : "↓"}
                    </button>
                </div>
            </div>

            <div className="mt-8">
                {renderTableContent()}
            </div>
        </div>

    );
}
