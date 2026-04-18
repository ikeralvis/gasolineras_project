import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import FavoritoButton from "./FavoritoButton";
import { useEstadisticas } from "../hooks/useEstadisticas";
import { getPriceBadgeFromStats } from "../api/estadisticas";
import HorarioDisplay, { type HorarioParsed } from "./HorarioDisplay";

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
  Horario?: string;
  horario_parsed?: HorarioParsed;
}

interface Props {
  gasolineras: Gasolinera[];
  combustibleSeleccionado: string;
}

const GasolinerasTable: React.FC<Props> = ({ gasolineras, combustibleSeleccionado }) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const navigate = useNavigate();
  const { estadisticas, loading: loadingStats } = useEstadisticas();

  const rowsPerPage = 12;

  const totalPages = Math.ceil(gasolineras.length / rowsPerPage);

  const paginated = gasolineras.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const openStationDetail = (ideess: string) => {
    navigate(`/gasolinera/${ideess}`);
  };

  const onCardKeyDown = (event: React.KeyboardEvent<HTMLElement>, ideess: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openStationDetail(ideess);
    }
  };

  // Función para obtener logo de la marca
  const getBrandLogo = (rotulo?: string): string | null => {
    const name = (rotulo ?? "").toLowerCase();
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

  const selectedStats = estadisticas && !loadingStats
    ? estadisticas.combustibles[getTipoEstadistica(combustibleSeleccionado)]
    : null;

  const statsPills = selectedStats
    ? [
        { label: t('gasStations.minimum'), value: `${selectedStats.min.toFixed(3)} €`, tone: 'text-green-700 bg-green-50 border-green-200' },
        { label: t('gasStations.average'), value: `${selectedStats.media.toFixed(3)} €`, tone: 'text-[#000C74] bg-[#F7F8FF] border-[#D7DBFF]' },
        { label: t('gasStations.maximum'), value: `${selectedStats.max.toFixed(3)} €`, tone: 'text-red-700 bg-red-50 border-red-200' },
      ]
    : [];

  // Safe getter for dynamic fuel price
  const getPriceByType = (gasolinera: Gasolinera, tipo: string): string | undefined => {
    const value = (gasolinera as unknown as Record<string, unknown>)[tipo];
    return typeof value === 'string' ? value : undefined;
  };

  return (
    <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-4 overflow-hidden">

      {/* ESTADISTICAS DE PRECIOS (modo compacto) */}
      {estadisticas && !loadingStats && (
        <div className="mb-4 rounded-xl border border-[#E5E7F9] bg-[#FCFCFF] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShowStats((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 text-left"
            aria-expanded={showStats}
          >
            <h3 className="text-xs font-semibold text-[#000C74] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {t('gasStations.statistics')}
              <span className="text-xs font-normal text-gray-600">
                ({estadisticas.total_gasolineras.toLocaleString()} {t('nav.gasStations').toLowerCase()})
              </span>
            </h3>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${showStats ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {selectedStats && (
            <div className={`mt-2 grid gap-2 transition-all ${showStats ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-3'}`}>
              {statsPills.map((pill) => (
                <div key={pill.label} className={`rounded-lg border px-2 py-1.5 ${pill.tone}`}>
                  <span className="block text-[11px] opacity-80">{pill.label}</span>
                  <span className="font-bold text-sm">{pill.value}</span>
                </div>
              ))}
            </div>
          )}
          {!selectedStats && (
            <p className="text-xs text-gray-500">{t('common.noResults')}</p>
          )}
          </div>
      )}

      {/* TABLE (ESCRITORIO) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-sm text-[#000C74]/70 border-b-2 border-[#E4E6FF]">
              <th className="py-4 text-left font-semibold">{t('table.brand')}</th>
              <th className="py-4 text-left font-semibold">{t('table.location')}</th>
              <th className="py-4 text-left font-semibold hidden lg:table-cell">{t('table.schedule')}</th>
              <th className="py-4 text-left font-semibold">{getNombreCombustible(combustibleSeleccionado)}</th>
              <th className="py-4 text-center font-semibold w-16">{t('table.favorite')}</th>
              <th className="py-4 text-left font-semibold"></th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((g) => {
              const stationName = g["Rótulo"] ?? (g as any).Rotulo ?? "Gasolinera";
              const logo = getBrandLogo(stationName);
              
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
                          alt={stationName} 
                          className="w-10 h-10 object-contain rounded-lg bg-white shadow-sm p-1"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-linear-to-br from-[#000C74] to-[#4A52D9] flex items-center justify-center text-white font-bold text-sm">
                          {stationName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{stationName}</p>
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

                  {/* HORARIO */}
                  <td className="py-4 hidden lg:table-cell">
                    <HorarioDisplay
                      mode="compact"
                      horario={g.Horario}
                      horario_parsed={g.horario_parsed}
                    />
                  </td>

                  {/* PRECIO DEL COMBUSTIBLE SELECCIONADO */}
                  <td className="py-4">
                    <div className="flex items-center">
                      <span className="text-lg font-bold text-gray-900">
                        {getPriceByType(g, combustibleSeleccionado) || "N/D"}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">€/L</span>
                      {getPriceBadge(getPriceByType(g, combustibleSeleccionado))}
                    </div>
                  </td>

                  {/* FAVORITO */}
                  <td className="py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <FavoritoButton ideess={g.IDEESS} size="md" />
                  </td>

                  {/* ACCIÓN */}
                  <td className="py-4">
                    <button className="text-[#000C74] opacity-0 group-hover:opacity-100 transition-opacity font-medium text-sm flex items-center gap-1">
                      {t('table.viewDetails')}
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
      <div className="md:hidden space-y-2.5">
        {paginated.map((g) => {
          const stationName = g["Rótulo"] ?? (g as any).Rotulo ?? "Gasolinera";
          const logo = getBrandLogo(stationName);
          
          return (
            <div
              key={g.IDEESS}
              className="border border-gray-200 rounded-xl p-3.5 shadow-sm bg-white hover:shadow-md transition-all"
            >
              <div className="mb-2.5 flex items-start justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => openStationDetail(g.IDEESS)}
                  className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={stationName}
                      className="w-10 h-10 object-contain rounded-lg bg-white shadow-sm p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-linear-to-br from-[#000C74] to-[#4A52D9] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {stationName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base text-[#000C74] truncate">
                      {stationName}
                    </h3>
                    <p className="text-xs text-gray-600 truncate">{g.Municipio}, {g.Provincia}</p>
                  </div>
                </button>
                <FavoritoButton ideess={g.IDEESS} size="lg" />
              </div>

              <button
                type="button"
                aria-label={`Ver detalle de ${stationName} en ${g.Municipio}`}
                onClick={() => openStationDetail(g.IDEESS)}
                onKeyDown={(event) => onCardKeyDown(event, g.IDEESS)}
                className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000C74] focus-visible:ring-offset-2"
              >

              {/* PRECIO DEL COMBUSTIBLE SELECCIONADO */}
              <div className="grid grid-cols-1 gap-3">
                <div className="p-2.5 rounded-lg bg-linear-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                  <span className="block text-xs text-blue-700 font-medium mb-1">{getNombreCombustible(combustibleSeleccionado)}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-gray-900">
                      {getPriceByType(g, combustibleSeleccionado) || "N/D"}
                    </span>
                    <span className="text-xs text-gray-600">€/L</span>
                  </div>
                  {getPriceBadge(getPriceByType(g, combustibleSeleccionado))}
                </div>
              </div>

              {/* HORARIO COMPACTO */}
              {(g.Horario || g.horario_parsed) && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5">
                  <HorarioDisplay
                    mode="compact"
                    horario={g.Horario}
                    horario_parsed={g.horario_parsed}
                  />
                </div>
              )}

              </button>

              <button
                type="button"
                onClick={() => openStationDetail(g.IDEESS)}
                className="mt-2.5 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#000C74] px-3 text-xs font-semibold text-white transition hover:bg-[#0A128C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000C74] focus-visible:ring-offset-2"
              >
                {t('table.viewDetails')}
              </button>
            </div>
          );
        })}
      </div>

      {/* PAGINACIÓN */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          {t('common.showing')} <span className="font-semibold">{(page - 1) * rowsPerPage + 1}</span> - <span className="font-semibold">{Math.min(page * rowsPerPage, gasolineras.length)}</span> {t('common.of')} <span className="font-semibold">{gasolineras.length}</span> {t('nav.gasStations').toLowerCase()}
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
            {t('common.previous')}
          </button>

          <div className="px-4 py-2 text-sm font-semibold text-[#000C74] bg-[#E4E6FF] rounded-lg">
            {page} / {totalPages}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium text-[#000C74] border border-[#C8CAEE] rounded-lg hover:bg-[#F8F9FF] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {t('common.next')}
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
