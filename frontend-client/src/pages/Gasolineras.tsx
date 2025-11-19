import { useEffect, useState } from "react";
import GasolinerasTable from "../components/GasolinerasTable";
import { getGasolinerasCerca } from "../api/gasolineras";

export default function Gasolineras() {
    const [gasolineras, setGasolineras] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [provincia, setProvincia] = useState("");
    const [municipio, setMunicipio] = useState("");
    const [nombre, setNombre] = useState("");
    const [precioMax, setPrecioMax] = useState("");
    const [tipoCombustible, setTipoCombustible] = useState("");

    const [ordenAsc, setOrdenAsc] = useState(true);
    
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
                    const precio = Number.parseFloat(g["Precio Gasolina 95 E5"].replace(",", "."));
                    return !Number.isNaN(precio) && precio <= maxPrecio;
                });
            }
        }

        if (tipoCombustible.trim() !== "") {
            resultado = resultado.filter((g) => {
                const precio = g[tipoCombustible];
                if (!precio) return false;
                const precioNum = Number.parseFloat(precio.replace(",", "."));
                return !Number.isNaN(precioNum) && precioNum > 0;
            });
        }

        setFiltered(resultado);
    }, [provincia, municipio, nombre, precioMax, tipoCombustible, gasolineras]);

    const ordenarPorPrecio = () => {
        const resultado = [...filtered].sort((a, b) => {
            const pA = Number.parseFloat(a["Precio Gasolina 95 E5"].replace(",", "."));
            const pB = Number.parseFloat(b["Precio Gasolina 95 E5"].replace(",", "."));
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
        setTipoCombustible("");
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
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

                    {/* TIPO DE COMBUSTIBLE */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            ⛽ Tipo de combustible
                        </label>
                        <select
                            value={tipoCombustible}
                            onChange={(e) => setTipoCombustible(e.target.value)}
                            className="w-full border border-[#C8CAEE] focus:border-[#000C74] focus:ring-2 focus:ring-[#000C74]/20 rounded-xl px-4 py-2.5 outline-none transition bg-white"
                        >
                            <option value="">Todos</option>
                            <option value="Precio Gasolina 95 E5">Gasolina 95 E5</option>
                            <option value="Precio Gasolina 98 E5">Gasolina 98 E5</option>
                            <option value="Precio Gasoleo A">Gasóleo A</option>
                            <option value="Precio Gasoleo B">Gasóleo B</option>
                            <option value="Precio Gasoleo Premium">Gasóleo Premium</option>
                        </select>
                    </div>
                </div>

                {/* Indicador de filtros activos */}
                {(provincia || municipio || nombre || precioMax || tipoCombustible) && (
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
                        {tipoCombustible && (
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                ⛽ {tipoCombustible.replace("Precio ", "")}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end mt-6">
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
                        <p className="text-lg text-gray-600">No se encontraron gasolineras</p>
                    </div>
                ) : (
                    <GasolinerasTable gasolineras={filtered} />
                )}
            </div>
        </div>

    );
}
