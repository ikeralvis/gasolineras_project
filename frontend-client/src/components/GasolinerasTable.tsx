import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


interface Gasolinera {
  IDEESS: string;
  Rótulo: string;
  Municipio: string;
  Provincia: string;
  ["Precio Gasolina 95 E5"]: string;
  ["Precio Gasoleo A"]: string;
}

interface Props {
  gasolineras: Gasolinera[];
}

const GasolinerasTable: React.FC<Props> = ({ gasolineras }) => {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const rowsPerPage = 10;

  const totalPages = Math.ceil(gasolineras.length / rowsPerPage);

  const paginated = gasolineras.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-2xl p-6">

      {/* TABLE (ESCRITORIO) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-sm text-[#000C74]/70 border-b">
              <th className="py-3 text-left font-medium">Marca</th>
              <th className="py-3 text-left font-medium">Municipio</th>
              <th className="py-3 text-left font-medium">Provincia</th>
              <th className="py-3 text-left font-medium">Gasolina 95</th>
              <th className="py-3 text-left font-medium">Gasóleo A</th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((g) => (
              <tr
                key={g.IDEESS}
                className="border-b hover:bg-gray-100 cursor-pointer"
                onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
              >
                <td className="py-3">{g["Rótulo"]}</td>
                <td className="py-3">{g.Municipio}</td>
                <td className="py-3">{g.Provincia}</td>
                <td className="py-3">{g["Precio Gasolina 95 E5"]} €</td>
                <td className="py-3">{g["Precio Gasoleo A"]} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CARDS (MÓVIL) */}
      <div className="md:hidden space-y-4">
        {paginated.map((g) => (
          <div
            key={g.IDEESS}
            className="border border-gray-200 rounded-xl p-4 shadow-sm bg-white"
          >
            <h3 className="font-semibold text-lg text-[#000C74]">
              {g["Rótulo"]}
            </h3>
            <p className="text-sm text-gray-600">{g.Municipio}, {g.Provincia}</p>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 rounded-lg bg-gray-50">
                <span className="block text-gray-500">Gasolina 95</span>
                <span className="font-medium">{g["Precio Gasolina 95 E5"]} €</span>
              </div>

              <div className="p-2 rounded-lg bg-gray-50">
                <span className="block text-gray-500">Gasóleo A</span>
                <span className="font-medium">{g["Precio Gasoleo A"]} €</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PAGINACIÓN */}
      <div className="flex items-center justify-center gap-6 mt-6">
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          className="px-4 py-2 text-sm text-[#000C74] border border-gray-300 rounded-full hover:bg-gray-100 transition"
        >
          Anterior
        </button>

        <span className="text-sm text-gray-600">
          Página {page} de {totalPages}
        </span>

        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          className="px-4 py-2 text-sm text-[#000C74] border border-gray-300 rounded-full hover:bg-gray-100 transition"
        >
          Siguiente
        </button>
      </div>

    </div >
  );
};

export default GasolinerasTable;
