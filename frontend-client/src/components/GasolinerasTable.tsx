import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import FavoritoButton from "./FavoritoButton";
import { useEstadisticas } from "../hooks/useEstadisticas";
import { getPriceBadgeFromStats } from "../api/estadisticas";

// Iconos de marcas
import repsol from "../assets/logos/repsol.svg";
import cepsa from "../assets/logos/cepsa.jpg";
import bp from "../assets/logos/bp.png";
import shell from "../assets/logos/shell.png";
import galp from "../assets/logos/galp.png";
import eroski from "../assets/logos/eroski.svg";
import moeve from "../assets/logos/moeve.png";

interface Gasolinera {
  IDEESS: string;
  Rótulo: string;
  Municipio: string;
  Provincia: string;
  ["Precio Gasolina 95 E5"]: string;
  ["Precio Gasolina 98 E5"]?: string;
  ["Precio Gasoleo A"]: string;
  ["Precio Gasoleo B"]?: string;
  ["Precio Gasoleo Premium"]?: string;
  [key: string]: string | undefined; // Permite acceso dinámico
}

interface Props {
  gasolineras: Gasolinera[];
  combustibleSeleccionado: string;
}

const GasolinerasTable: React.FC<Props> = ({ gasolineras, combustibleSeleccionado }) => {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { estadisticas, loading: loadingStats } = useEstadisticas();

  const rowsPerPage = 10;

  const totalPages = Math.ceil(gasolineras.length / rowsPerPage);

  const paginated = gasolineras.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  // Función para obtener logo de la marca
  const getBrandLogo = (rotulo: string): string | null => {
    const name = rotulo.toLowerCase();
    if (name.includes("repsol")) return repsol;
    if (name.includes("cepsa")) return cepsa;
    if (name.includes("bp")) return bp;
    if (name.includes("shell")) return shell;
    if (name.includes("galp")) return galp;
    if (name.includes("eroski")) return eroski;
    if (name.includes("moeve")) return moeve;
    return null;
  };

  // Función para obtener el nombre legible del combustible
  const getNombreCombustible = (tipoCombustible: string): string => {
    const nombres: Record<string, string> = {
      "Precio Gasolina 95 E5": "Gasolina 95 E5",
      "Precio Gasolina 98 E5": "Gasolina 98 E5",
      "Precio Gasoleo A": "Gasóleo A",
      "Precio Gasoleo B": "Gasóleo B",
      "Precio Gasoleo Premium": "Gasóleo Premium"
    };
    return nombres[tipoCombustible] || tipoCombustible;
  };

  // Función para obtener el tipo de estadística según el combustible
  const getTipoEstadistica = (tipoCombustible: string): "gasolina_95" | "gasoleo_a" => {
    if (tipoCombustible.includes("Gasolina 95")) return "gasolina_95";
    return "gasoleo_a";
  };

  // Función para determinar badge de precio usando estadísticas dinámicas
  const getPriceBadge = (precio: string | undefined) => {
    if (!precio || !estadisticas || loadingStats) return null;
    
    const tipo = getTipoEstadistica(combustibleSeleccionado);
    const stats = estadisticas.combustibles[tipo];
    const badge = getPriceBadgeFromStats(precio, stats);
    
    if (!badge) return null;

    const bgColor = badge.color === 'green' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
    
    return (
      <span className={`ml-2 text-xs ${bgColor} px-2 py-0.5 rounded-full font-medium`}>
        {badge.texto}
      </span>
    );
  };

  return (
    <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-6 overflow-hidden">

      {/* ESTADÍSTICAS DE PRECIOS */}
      {estadisticas && !loadingStats && (
        <div className="mb-6 p-4 bg-linear-to-r from-[#F8F9FF] to-[#E4E6FF] rounded-xl border border-[#C8CAEE]">
          <h3 className="text-sm font-semibold text-[#000C74] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Estadísticas de Precios
            <span className="text-xs font-normal text-gray-600">
              ({estadisticas.total_gasolineras.toLocaleString()} gasolineras)
            </span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GASOLINA 95 */}
            {estadisticas.combustibles.gasolina_95 && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="font-semibold text-sm text-gray-900">Gasolina 95 E5</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500 block">Mínimo</span>
                    <span className="font-bold text-green-600">
                      {estadisticas.combustibles.gasolina_95.min.toFixed(3)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Media</span>
                    <span className="font-bold text-[#000C74]">
                      {estadisticas.combustibles.gasolina_95.media.toFixed(3)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Máximo</span>
                    <span className="font-bold text-red-600">
                      {estadisticas.combustibles.gasolina_95.max.toFixed(3)} €
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* GASÓLEO A */}
            {estadisticas.combustibles.gasoleo_a && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-green-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="font-semibold text-sm text-gray-900">Gasóleo A</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500 block">Mínimo</span>
                    <span className="font-bold text-green-600">
                      {estadisticas.combustibles.gasoleo_a.min.toFixed(3)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Media</span>
                    <span className="font-bold text-[#000C74]">
                      {estadisticas.combustibles.gasoleo_a.media.toFixed(3)} €
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Máximo</span>
                    <span className="font-bold text-red-600">
                      {estadisticas.combustibles.gasoleo_a.max.toFixed(3)} €
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLE (ESCRITORIO) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-sm text-[#000C74]/70 border-b-2 border-[#E4E6FF]">
              <th className="py-4 text-left font-semibold">Marca</th>
              <th className="py-4 text-left font-semibold">Ubicación</th>
              <th className="py-4 text-left font-semibold">{getNombreCombustible(combustibleSeleccionado)}</th>
              <th className="py-4 text-center font-semibold w-16">Fav</th>
              <th className="py-4 text-left font-semibold"></th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((g) => {
              const logo = getBrandLogo(g["Rótulo"]);
              
              return (
                <tr
                  key={g.IDEESS}
                  className="border-b border-gray-100 hover:bg-[#F8F9FF] transition-all cursor-pointer group"
                  onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
                >
                  {/* MARCA CON LOGO */}
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      {logo ? (
                        <img 
                          src={logo} 
                          alt={g["Rótulo"]} 
                          className="w-10 h-10 object-contain rounded-lg bg-white shadow-sm p-1"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-linear-to-br from-[#000C74] to-[#4A52D9] flex items-center justify-center text-white font-bold text-sm">
                          {g["Rótulo"].substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{g["Rótulo"]}</p>
                      </div>
                    </div>
                  </td>

                  {/* UBICACIÓN */}
                  <td className="py-4">
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">{g.Municipio}</p>
                      <p className="text-gray-500">{g.Provincia}</p>
                    </div>
                  </td>

                  {/* PRECIO DEL COMBUSTIBLE SELECCIONADO */}
                  <td className="py-4">
                    <div className="flex items-center">
                      <span className="text-lg font-bold text-gray-900">
                        {g[combustibleSeleccionado] || "N/D"}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">€/L</span>
                      {getPriceBadge(g[combustibleSeleccionado])}
                    </div>
                  </td>

                  {/* FAVORITO */}
                  <td className="py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <FavoritoButton ideess={g.IDEESS} size="md" />
                  </td>

                  {/* ACCIÓN */}
                  <td className="py-4">
                    <button className="text-[#000C74] opacity-0 group-hover:opacity-100 transition-opacity font-medium text-sm flex items-center gap-1">
                      Ver detalles
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CARDS (MÓVIL) */}
      <div className="md:hidden space-y-4">
        {paginated.map((g) => {
          const logo = getBrandLogo(g["Rótulo"]);
          
          return (
            <div
              key={g.IDEESS}
              className="border border-gray-200 rounded-xl p-5 shadow-sm bg-white hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
            >
              {/* HEADER CON LOGO */}
              <div className="flex items-center gap-3 mb-4">
                {logo ? (
                  <img 
                    src={logo} 
                    alt={g["Rótulo"]} 
                    className="w-12 h-12 object-contain rounded-lg bg-white shadow-sm p-1"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-linear-to-br from-[#000C74] to-[#4A52D9] flex items-center justify-center text-white font-bold">
                    {g["Rótulo"].substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-[#000C74]">
                    {g["Rótulo"]}
                  </h3>
                  <p className="text-sm text-gray-600">{g.Municipio}, {g.Provincia}</p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <FavoritoButton ideess={g.IDEESS} size="lg" />
                </div>
              </div>

              {/* PRECIO DEL COMBUSTIBLE SELECCIONADO */}
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 rounded-lg bg-linear-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                  <span className="block text-xs text-blue-700 font-medium mb-1">{getNombreCombustible(combustibleSeleccionado)}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-gray-900">
                      {g[combustibleSeleccionado] || "N/D"}
                    </span>
                    <span className="text-xs text-gray-600">€/L</span>
                  </div>
                  {getPriceBadge(g[combustibleSeleccionado])}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* PAGINACIÓN */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          Mostrando <span className="font-semibold">{(page - 1) * rowsPerPage + 1}</span> - <span className="font-semibold">{Math.min(page * rowsPerPage, gasolineras.length)}</span> de <span className="font-semibold">{gasolineras.length}</span> gasolineras
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-[#000C74] border border-[#C8CAEE] rounded-lg hover:bg-[#F8F9FF] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Anterior
          </button>

          <div className="px-4 py-2 text-sm font-semibold text-[#000C74] bg-[#E4E6FF] rounded-lg">
            {page} / {totalPages}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium text-[#000C74] border border-[#C8CAEE] rounded-lg hover:bg-[#F8F9FF] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            Siguiente
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

    </div >
  );
};

export default GasolinerasTable;
