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

    const [ordenAsc, setOrdenAsc] = useState(true);


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

    const aplicarFiltros = () => {
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

        setFiltered(resultado);
    };

    const ordenarPorPrecio = () => {
        const resultado = [...filtered].sort((a, b) => {
            const pA = Number.parseFloat(a["Precio Gasolina 95 E5"].replace(",", "."));
            const pB = Number.parseFloat(b["Precio Gasolina 95 E5"].replace(",", "."));
            return ordenAsc ? pA - pB : pB - pA;
        });

        setFiltered(resultado);
        setOrdenAsc(!ordenAsc);
    };


    return (
        <div className="max-w-7xl mx-auto px-4 py-12">
            <h1 className="text-4xl font-bold text-[#000C74] mb-8">
                Gasolineras
            </h1>

            {/* Filtros */}
            <div className="bg-white shadow-lg border border-[#D9DBF2]/70 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                    type="text"
                    placeholder="Provincia"
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value)}
                    className="border border-[#C8CAEE] focus:border-[#000C74] rounded-xl px-4 py-2 outline-none transition"
                />

                <input
                    type="text"
                    placeholder="Municipio"
                    value={municipio}
                    onChange={(e) => setMunicipio(e.target.value)}
                    className="border border-[#C8CAEE] focus:border-[#000C74] rounded-xl px-4 py-2 outline-none transition"
                />

                <input
                    type="text"
                    placeholder="Nombre / Rótulo"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="border border-[#C8CAEE] focus:border-[#000C74] rounded-xl px-4 py-2 outline-none transition"
                />
            </div>

            <div className="flex justify-end mt-6 gap-3">
                <button
                    className="px-6 py-2 bg-[#000C74] text-white rounded-full hover:bg-[#0A128C] transition shadow-md"
                    onClick={aplicarFiltros}
                >
                    Aplicar filtros
                </button>

                <button
                    className="px-6 py-2 bg-[#E4E6FF] text-[#000C74] rounded-full hover:bg-[#D8DBFF] transition shadow-md"
                    onClick={ordenarPorPrecio}
                >
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
