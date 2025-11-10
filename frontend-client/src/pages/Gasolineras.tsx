import { useEffect, useState } from "react";
import GasolinerasTable from "../components/GasolinerasTable";

export default function Gasolineras() {
    const [gasolineras, setGasolineras] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);

    const [provincia, setProvincia] = useState("");
    const [municipio, setMunicipio] = useState("");
    const [nombre, setNombre] = useState("");

    const [ordenAsc, setOrdenAsc] = useState(true);


    useEffect(() => {
        fetch("http://localhost:8080/api/gasolineras")
            .then((res) => res.json())
            .then((data) => {
                setGasolineras(data.gasolineras || data);
                setFiltered(data.gasolineras || data);
            });
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
                <GasolinerasTable gasolineras={filtered} />
            </div>
        </div>

    );
}
