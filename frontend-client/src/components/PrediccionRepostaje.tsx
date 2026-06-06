import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceDot,
  ErrorBar,
  ResponsiveContainer,
} from 'recharts';
import { usePredictions, type PredictionPoint } from '../hooks/usePredictions';

interface Gasolinera {
  IDEESS: string;
  Rótulo: string;
  Municipio: string;
}

interface Props {
  gasolineras: Gasolinera[];
}

const FUEL_KEYS = {
  g95: 'Precio Gasolina 95 E5',
  diesel: 'Precio Gasoleo A',
} as const;

const STATION_COLORS = ['#000C74', '#4338ca', '#7c3aed', '#0891b2', '#0f766e', '#b45309'];

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function stationLabel(g: Gasolinera): string {
  return g.Rótulo ? `${g.Rótulo} (${g.Municipio})` : g.Municipio;
}

type ChartEntry = Record<string, number | string | undefined>;

interface TooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
}

export default function PrediccionRepostaje({ gasolineras }: Props) {
  const { t } = useTranslation();
  const [selectedFuel, setSelectedFuel] = useState<'g95' | 'diesel'>('g95');

  const ideessList = useMemo(() => gasolineras.map(g => g.IDEESS), [gasolineras]);
  const { byStation, runDate, loading, error } = usePredictions(ideessList);

  const fuelKey = FUEL_KEYS[selectedFuel];

  const forecastDates = useMemo(() => {
    const firstStation = Object.values(byStation)[0] ?? [];
    const byFuel = firstStation.filter((p: PredictionPoint) => p.fuel === fuelKey);
    return [...new Set(byFuel.map((p: PredictionPoint) => p.forecast_date))].sort((a, b) => a.localeCompare(b));
  }, [byStation, fuelKey]);

  const best = useMemo(() => {
    let bestDay = '';
    let bestStation: Gasolinera | null = null;
    let bestPrice = Infinity;
    for (const ideess of Object.keys(byStation)) {
      const g = gasolineras.find(x => x.IDEESS === ideess);
      if (!g) continue;
      for (const point of byStation[ideess]) {
        if (point.fuel !== fuelKey) continue;
        if (point.precio_predicho < bestPrice) {
          bestPrice = point.precio_predicho;
          bestDay = point.forecast_date;
          bestStation = g;
        }
      }
    }
    return bestStation ? { station: bestStation, date: bestDay, price: bestPrice } : null;
  }, [byStation, gasolineras, fuelKey]);

  const chartData = useMemo((): ChartEntry[] => {
    return forecastDates.map(date => {
      const entry: ChartEntry = { date: formatDay(date), fullDate: date };
      let cheapestDay = '';
      let minPrice = Infinity;

      for (const g of gasolineras) {
        const preds: PredictionPoint[] = byStation[g.IDEESS] ?? [];
        const point = preds.find(p => p.forecast_date === date && p.fuel === fuelKey);
        if (point) {
          entry[`s_${g.IDEESS}`] = point.precio_predicho;
          // ErrorBar expects [lowerError, upperError] relative to the value
          entry[`err_${g.IDEESS}`] = JSON.stringify([
            +(point.precio_predicho - point.margen_min).toFixed(3),
            +(point.margen_max - point.precio_predicho).toFixed(3),
          ]);
          entry[`rmin_${g.IDEESS}`] = point.margen_min;
          entry[`rmax_${g.IDEESS}`] = point.margen_max;
          if (point.precio_predicho < minPrice) {
            minPrice = point.precio_predicho;
            cheapestDay = g.IDEESS;
          }
        }
      }
      entry.cheapestDay = cheapestDay;
      return entry;
    });
  }, [forecastDates, gasolineras, byStation, fuelKey]);

  const cheapestDot = useMemo(() => {
    if (!best) return null;
    return chartData.find(d => d.fullDate === best.date) ?? null;
  }, [best, chartData]);

  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    const dayEntry = chartData.find(d => d.date === label);
    if (!dayEntry) return null;

    const rows = gasolineras
      .map((g, i) => {
        const price = dayEntry[`s_${g.IDEESS}`] as number | undefined;
        if (price === undefined) return null;
        const rmin = dayEntry[`rmin_${g.IDEESS}`] as number | undefined;
        const rmax = dayEntry[`rmax_${g.IDEESS}`] as number | undefined;
        const isCheapest = dayEntry.cheapestDay === g.IDEESS;
        return { g, i, price, rmin, rmax, isCheapest };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.price ?? 0) - (b!.price ?? 0));

    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 min-w-55">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
        {rows.map(row => {
          if (!row) return null;
          const { g, i, price, rmin, rmax, isCheapest } = row;
          return (
            <div key={g.IDEESS} className="flex items-center gap-2 py-0.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: STATION_COLORS[i % STATION_COLORS.length] }}
              />
              <span className="text-[11px] text-gray-600 flex-1 truncate" style={{ maxWidth: 120 }}>
                {g.Rótulo || g.Municipio}
              </span>
              <span className={`text-[11px] font-semibold ${isCheapest ? 'text-green-700' : 'text-gray-800'}`}>
                {price.toFixed(3)}
                {isCheapest && ' ★'}
              </span>
              {rmin !== undefined && rmax !== undefined && (
                <span className="text-[10px] text-gray-400">{rmin.toFixed(3)}–{rmax.toFixed(3)}</span>
              )}
            </div>
          );
        })}
        <p className="text-[10px] text-gray-300 mt-2 pt-1.5 border-t border-gray-100">Intervalo 5%–95%</p>
      </div>
    );
  };

  const hasData = forecastDates.length > 0;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-xl bg-[#EEF0FF] animate-pulse" />
          <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !hasData) {
    return (
      <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm mt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#EEF0FF] flex items-center justify-center text-[#000C74] text-lg">
            📊
          </div>
          <div>
            <p className="font-semibold text-[#0f172a]">{t('prediction.title')}</p>
            <p className="text-sm text-gray-500">{t('prediction.noData')}</p>
          </div>
        </div>
      </div>
    );
  }

  const cheapestIdx = best ? gasolineras.findIndex(g => g.IDEESS === best.station.IDEESS) : -1;

  return (
    <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm mt-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#EEF0FF] flex items-center justify-center text-[#000C74] text-lg">
            📈
          </div>
          <div>
            <p className="font-semibold text-[#0f172a]">{t('prediction.title')}</p>
            <p className="text-xs text-gray-500">{t('prediction.subtitle')}</p>
          </div>
        </div>

        <div className="flex rounded-xl bg-[#F5F6FF] p-1 gap-1 self-start sm:self-auto">
          <button
            onClick={() => setSelectedFuel('g95')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              selectedFuel === 'g95'
                ? 'bg-[#000C74] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white/60'
            }`}
          >
            {t('prediction.fuel95')}
          </button>
          <button
            onClick={() => setSelectedFuel('diesel')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              selectedFuel === 'diesel'
                ? 'bg-[#000C74] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white/60'
            }`}
          >
            {t('prediction.fuelDiesel')}
          </button>
        </div>
      </div>

      {/* Best option card */}
      {best && (
        <div className="mb-5 rounded-xl bg-green-50 border border-green-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center text-green-700 text-lg shrink-0">
            🏆
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
              {t('prediction.bestOption')}
            </p>
            <p className="text-sm text-gray-700 mt-0.5">
              <span className="font-semibold text-[#0f172a] capitalize">{formatFullDate(best.date)}</span>
              {' · '}
              <span className="font-medium">{stationLabel(best.station)}</span>
            </p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="text-2xl font-bold text-green-700">{best.price.toFixed(3)}</p>
            <p className="text-xs text-green-600">{t('prediction.perLiter')}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="overflow-x-auto -mx-2">
        <div style={{ minWidth: 320 }}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin - 0.03', 'dataMax + 0.03']}
                tickFormatter={v => `${Number(v).toFixed(2)}`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(_value, entry) => {
                  const stationId = (entry?.dataKey as string)?.replace('s_', '');
                  const g = gasolineras.find(x => x.IDEESS === stationId);
                  return (
                    <span style={{ color: '#374151', fontSize: 11 }}>
                      {g ? (g.Rótulo || g.Municipio) : stationId}
                    </span>
                  );
                }}
                wrapperStyle={{ paddingTop: 8 }}
              />

              {gasolineras.map((g, i) => (
                <Line
                  key={g.IDEESS}
                  type="monotone"
                  dataKey={`s_${g.IDEESS}`}
                  stroke={STATION_COLORS[i % STATION_COLORS.length]}
                  strokeWidth={2}
                  dot={{
                    r: 3.5,
                    fill: STATION_COLORS[i % STATION_COLORS.length],
                    strokeWidth: 0,
                  }}
                  activeDot={{
                    r: 5.5,
                    stroke: 'white',
                    strokeWidth: 2,
                    fill: STATION_COLORS[i % STATION_COLORS.length],
                  }}
                >
                  <ErrorBar
                    dataKey={`err_${g.IDEESS}`}
                    width={4}
                    strokeWidth={1.5}
                    stroke={STATION_COLORS[i % STATION_COLORS.length]}
                    opacity={0.35}
                    direction="y"
                  />
                </Line>
              ))}

              {/* Green dot on global cheapest point */}
              {cheapestDot && best && cheapestIdx >= 0 && (
                <ReferenceDot
                  x={cheapestDot.date as string}
                  y={best.price}
                  r={8}
                  fill="#16a34a"
                  stroke="white"
                  strokeWidth={2.5}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Caption */}
      <p className="text-[10px] text-gray-400 mt-1">
        Las barras verticales muestran el intervalo de confianza (percentiles 5%–95%) · El punto verde marca el mejor precio predicho
      </p>

      {runDate && (
        <p className="text-xs text-gray-400 mt-2 text-right">
          {t('prediction.runDate')}: {new Date(runDate + 'T00:00:00').toLocaleDateString('es-ES')}
        </p>
      )}
    </div>
  );
}
