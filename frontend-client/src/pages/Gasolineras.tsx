import { useEffect, useState } from "react";
import GasolinerasTable from "../components/GasolinerasTable";
import { getGasolinerasCerca } from "../api/gasolineras";
import { useAuth } from "../contexts/AuthContext";

export default function Gasolineras() {
    const { user } = useAuth();
    const [gasolineras, setGasolineras] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [provincia, setProvincia] = useState("");
    const [municipio, setMunicipio] = useState("");
    const [nombre, setNombre] = useState("");
    const [precioMax, setPrecioMax] = useState("");
    
    // Estado para el tipo de combustible seleccionado
    const [combustibleSeleccionado, setCombustibleSeleccionado] = useState<string>(
        user?.combustible_favorito || "Precio Gasolina 95 E5"
    );

    const [ordenAsc, setOrdenAsc] = useState(true);
    
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
    const provinciasUnicas = [...new Set(gasolineras.map(g => g.Provincia))].sort();
    const municipiosUnicas = [...new Set(
        gasolineras
            .filter(g => !provincia || g.Provincia.toLowerCase().includes(provincia.toLowerCase()))
            .map(g => g.Municipio)
    )].sort();


    useEffect(() => {
  async function cargarDatos() {
    try {
      console.log("🔄 Iniciando carga de gasolineras...");
      setLoading(true);
      
      // Función para cargar todas las gasolineras (fallback)
      const cargarTodasLasGasolineras = async () => {
        console.log("🔄 Cargando todas las gasolineras...");
        const res = await fetch("http://localhost:8080/api/gasolineras");
        const data = await res.json();
        console.log("� Respuesta del servidor:", data);
        
        const gasolinerasData = data.gasolineras || [];
        console.log("� Total gasolineras cargadas:", gasolinerasData.length);
        
        setGasolineras(gasolinerasData);
        setFiltered(gasolinerasData);
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
          console.log("� Ubicación detectada:", lat, lon);

          const cerca = await getGasolinerasCerca(lat, lon, 50);
          console.log("� Gasolineras cercanas recibidas:", cerca.length);
          setGasolineras(cerca);
          setFiltered(cerca);
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
        resultado = resultado.filter((g) => {
            const precio = g[combustibleSeleccionado];
            if (!precio) return false;
            const precioNum = Number.parseFloat(precio.replace(",", "."));
            return !Number.isNaN(precioNum) && precioNum > 0;
        });

        setFiltered(resultado);
    }, [provincia, municipio, nombre, precioMax, combustibleSeleccionado, gasolineras]);

    const ordenarPorPrecio = () => {
        const resultado = [...filtered].sort((a, b) => {
            const pA = Number.parseFloat(a[combustibleSeleccionado]?.replace(",", ".") || "999");
            const pB = Number.parseFloat(b[combustibleSeleccionado]?.replace(",", ".") || "999");
            return ordenAsc ? pA - pB : pB - pA;
        });

        setFiltered(resultado);
        setOrdenAsc(!ordenAsc);
    };

    const limpiarFiltros = () => {
        setProvincia("");
        setMunicipio("");
        setNombre("");
        setPrecioMax("");
    };
    
    const seleccionarProvincia = (prov: string) => {
        setProvincia(prov);
        setShowProvinciaDropdown(false);
    };
    
    const seleccionarMunicipio = (muni: string) => {
        setMunicipio(muni);
        setShowMunicipioDropdown(false);
    };


    return (
        <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="mb-8">
                <h1 className="text-4xl font-bold text-[#000C74] mb-2">
                    Gasolineras
                </h1>
                <p className="text-gray-600">
                    Encuentra las mejores opciones cerca de ti
                </p>
            </div>

            {/* Filtros */}
            <div className="bg-white shadow-lg border border-[#D9DBF2]/70 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
                        <p className="text-sm text-gray-500 mt-1">Selecciona tu tipo de combustible preferido</p>
                    </div>
                    <button
                        onClick={limpiarFiltros}
                        className="text-sm text-[#000C74] hover:text-[#0A128C] font-medium flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Limpiar filtros
                    </button>
                </div>

                {/* SELECTOR DE COMBUSTIBLE - DESTACADO */}
                <div className="mb-6 p-4 bg-gradient-to-r from-[#000C74]/5 to-[#4A52D9]/5 rounded-xl border-2 border-[#000C74]/20">
                    <label className="block text-sm font-bold text-[#000C74] mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Tipo de Combustible
                    </label>
                    <select
                        value={combustibleSeleccionado}
                        onChange={(e) => setCombustibleSeleccionado(e.target.value)}
                        className="w-full border-2 border-[#000C74]/30 focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-3 outline-none transition bg-white font-medium text-gray-900"
                    >
                        <option value="Precio Gasolina 95 E5">⛽ Gasolina 95 E5</option>
                        <option value="Precio Gasolina 98 E5">⛽ Gasolina 98 E5</option>
                        <option value="Precio Gasoleo A">🚗 Gasóleo A</option>
                        <option value="Precio Gasoleo B">🚜 Gasóleo B</option>
                        <option value="Precio Gasoleo Premium">💎 Gasóleo Premium</option>
                    </select>
                    <p className="text-xs text-gray-600 mt-2">
                        La tabla mostrará y ordenará solo por este combustible
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* PROVINCIA CON AUTOCOMPLETE */}
                    <div className="relative">
                        <label htmlFor="provincia" className="block text-sm font-medium text-gray-700 mb-2">
                            🏙️ Provincia
                        </label>
                        <input
                            id="provincia"
                            type="text"
                            placeholder="Ej: Madrid"
                            value={provincia}
                            onChange={(e) => {
                                setProvincia(e.target.value);
                                setShowProvinciaDropdown(true);
                            }}
                            onFocus={() => setShowProvinciaDropdown(true)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                        />
                        
                        {/* Dropdown de provincias */}
                        {showProvinciaDropdown && provincia && (
                            <div 
                                className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
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
                            📍 Municipio
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Alcalá de Henares"
                            value={municipio}
                            onChange={(e) => {
                                setMunicipio(e.target.value);
                                setShowMunicipioDropdown(true);
                            }}
                            onFocus={() => setShowMunicipioDropdown(true)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                        />
                        
                        {/* Dropdown de municipios */}
                        {showMunicipioDropdown && municipio && (
                            <div 
                                className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
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
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            🏢 Marca / Nombre
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Repsol"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            💰 Precio máx (€/L)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            placeholder="Ej: 1.50"
                            value={precioMax}
                            onChange={(e) => setPrecioMax(e.target.value)}
                            className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition"
                        />
                    </div>
                </div>

                {/* Indicador de filtros activos */}
                {(provincia || municipio || nombre || precioMax) && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium">
                                {filtered.length} de {gasolineras.length} gasolineras
                            </span>
                        </div>
                        
                        {/* Badges de filtros activos */}
                        {provincia && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                📍 {provincia}
                            </span>
                        )}
                        {municipio && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                🏘️ {municipio}
                            </span>
                        )}
                        {nombre && (
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                🏢 {nombre}
                            </span>
                        )}
                        {precioMax && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                💰 Max {precioMax}€
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-6">
                <div className="text-sm text-gray-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                    <span className="font-semibold text-blue-900">
                        {combustibleSeleccionado.replace("Precio ", "")}
                    </span>
                    {" "}- Mostrando {filtered.length} gasolineras
                </div>
                <button
                    className="px-6 py-2.5 bg-[#000C74] text-white rounded-xl hover:bg-[#0A128C] transition shadow-md font-medium flex items-center gap-2"
                    onClick={ordenarPorPrecio}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    Ordenar por precio {ordenAsc ? "↑" : "↓"}
                </button>
            </div>

            <div className="mt-10">
                {loading ? (
                    <div className="text-center py-12">
                        <p className="text-lg text-gray-600">Cargando gasolineras...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-lg text-gray-600">No se encontraron gasolineras con {combustibleSeleccionado.replace("Precio ", "")}</p>
                    </div>
                ) : (
                    <GasolinerasTable 
                        gasolineras={filtered} 
                        combustibleSeleccionado={combustibleSeleccionado}
                    />
                )}
            </div>
        </div>

    );
}
