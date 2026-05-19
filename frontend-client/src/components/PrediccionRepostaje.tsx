import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  Legend,
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
const CHEAPEST_COLOR = '#16a34a';

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

export default function PrediccionRepostaje({ gasolineras }: Props) {
  const { t } = useTranslation();
  const [selectedFuel, setSelectedFuel] = useState<'g95' | 'diesel'>('g95');

  const ideessList = useMemo(() => gasolineras.map(g => g.IDEESS), [gasolineras]);
  const { byStation, runDate, loading, error } = usePredictions(ideessList);

  const fuelKey = FUEL_KEYS[selectedFuel];

  // Build sorted list of forecast dates from first available station
  const forecastDates = useMemo(() => {
    const firstStation = Object.values(byStation)[0] ?? [];
    const byFuel = firstStation.filter(p => p.fuel === fuelKey);
    return [...new Set(byFuel.map(p => p.forecast_date))].sort();
  }, [byStation, fuelKey]);

  // Build chart data: one entry per day, one key per station
  const chartData = useMemo(() => {
    return forecastDates.map(date => {
      const entry: Record<string, unknown> = {
        date: formatDay(date),
        fullDate: date,
      };
      let minPrice = Infinity;
      let cheapest = '';
      for (const g of gasolineras) {
        const preds: PredictionPoint[] = byStation[g.IDEESS] ?? [];
        const point = preds.find(p => p.forecast_date === date && p.fuel === fuelKey);
        if (point) {
          const price = point.precio_predicho;
          entry[`s_${g.IDEESS}`] = price;
          if (price < minPrice) {
            minPrice = price;
            cheapest = g.IDEESS;
          }
        }
      }
      entry.cheapest = cheapest;
      entry.minPrice = minPrice === Infinity ? undefined : minPrice;
      return entry;
    });
  }, [forecastDates, gasolineras, byStation, fuelKey]);

  // Best overall option
  const best = useMemo(() => {
    let bestDay = '';
    let bestStation: Gasolinera | null = null;
    let bestPrice = Infinity;
    for (const day of chartData) {
      for (const g of gasolineras) {
        const price = day[`s_${g.IDEESS}`] as number | undefined;
        if (price !== undefined && price < bestPrice) {
          bestPrice = price;
          bestDay = day.fullDate as string;
          bestStation = g;
        }
      }
    }
    return bestStation ? { station: bestStation, date: bestDay, price: bestPrice } : null;
  }, [chartData, gasolineras]);

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

  return (
    <div className="bg-white rounded-2xl border border-[#E7E9FB] p-6 shadow-sm mt-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#EEF0FF] flex items-center justify-center text-[#000C74] text-lg">
            📊
          </div>
          <div>
            <p className="font-semibold text-[#0f172a]">{t('prediction.title')}</p>
            <p className="text-xs text-gray-500">{t('prediction.subtitle')}</p>
          </div>
        </div>

        {/* Fuel tabs */}
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
        <div style={{ minWidth: Math.max(gasolineras.length * 7 * 18 + 80, 360) }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
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
                width={42}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const stationId = (props?.dataKey as string)?.replace('s_', '');
                  const g = gasolineras.find(x => x.IDEESS === stationId);
                  const price = typeof value === 'number' ? value.toFixed(3) : String(value);
                  return [`${price} €/L`, g ? stationLabel(g) : stationId];
                }}
                labelFormatter={(label) => `${label}`}
                contentStyle={{ borderRadius: 10, fontSize: 12 }}
              />
              <Legend
                formatter={(_value, entry) => {
                  const stationId = (entry?.dataKey as string)?.replace('s_', '');
                  const g = gasolineras.find(x => x.IDEESS === stationId);
                  return g ? (g.Rótulo || g.Municipio) : (stationId ?? '');
                }}
                wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
              />
              {gasolineras.map((g, i) => (
                <Bar
                  key={g.IDEESS}
                  dataKey={`s_${g.IDEESS}`}
                  fill={STATION_COLORS[i % STATION_COLORS.length]}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                >
                  {chartData.map((day) => (
                    <Cell
                      key={day.fullDate as string}
                      fill={
                        day.cheapest === g.IDEESS
                          ? CHEAPEST_COLOR
                          : STATION_COLORS[i % STATION_COLORS.length]
                      }
                      opacity={day.cheapest === g.IDEESS ? 1 : 0.75}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Run date footer */}
      {runDate && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {t('prediction.runDate')}: {new Date(runDate + 'T00:00:00').toLocaleDateString('es-ES')}
        </p>
      )}
    </div>
  );
}
