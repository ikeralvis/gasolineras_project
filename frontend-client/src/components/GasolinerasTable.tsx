import React, { useState } from "react";

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
  const rowsPerPage = 10;

  const totalPages = Math.ceil(gasolineras.length / rowsPerPage);

  const paginated = gasolineras.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  return (
    <div className="bg-white shadow rounded-xl p-6 border border-gray-200">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-gray-600 text-sm border-b">
            <th className="py-2">Marca</th>
            <th className="py-2">Municipio</th>
            <th className="py-2">Provincia</th>
            <th className="py-2">Gasolina 95</th>
            <th className="py-2">Gasóleo A</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((g) => (
            <tr key={g.IDEESS} className="border-b hover:bg-gray-50 cursor-pointer">
              <td className="py-2">{g["Rótulo"]}</td>
              <td className="py-2">{g.Municipio}</td>
              <td className="py-2">{g.Provincia}</td>
              <td className="py-2">{g["Precio Gasolina 95 E5"]} €</td>
              <td className="py-2">{g["Precio Gasoleo A"]} €</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Prev
        </button>
        <span className="text-gray-700 text-sm">
          Página {page} de {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          className="px-4 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default GasolinerasTable;
