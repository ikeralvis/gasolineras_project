import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getHistorialPrecios } from "../api/gasolineras";

interface HistorialPreciosProps {
  ideess: string;
}

interface RegistroHistorico {
  fecha: string;
  precios: {
    "Gasolina 95 E5"?: string;
    "Gasolina 98 E5"?: string;
    "Gasóleo A"?: string;
    "Gasóleo B"?: string;
    "Gasóleo Premium"?: string;
  };
}

interface DatosGrafico {
  fecha: string;
  fechaFormateada: string;
  gasolina95?: number;
  gasolina98?: number;
  gasoleoA?: number;
  gasoleoB?: number;
  gasoleoPremium?: number;
}

const parsePrecio = (precio?: string): number | undefined => {
  if (!precio) return undefined;
  const num = Number.parseFloat(precio.replace(",", "."));
  return Number.isNaN(num) || num === 0 ? undefined : num;
};

const formatearFecha = (isoString: string): string => {
  const fecha = new Date(isoString);
  return fecha.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
};

export default function HistorialPrecios({ ideess }: Readonly<HistorialPreciosProps>) {
  const [datos, setDatos] = useState<DatosGrafico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dias, setDias] = useState(30);
  const [combustibleVisible, setCombustibleVisible] = useState({
    gasolina95: true,
    gasolina98: true,
    gasoleoA: true,
    gasoleoB: false,
    gasoleoPremium: false,
  });

  useEffect(() => {
    const cargarHistorial = async () => {
      setLoading(true);
      setError(false);
      
      const resultado = await getHistorialPrecios(ideess, dias);
      
      if (!resultado || resultado.registros === 0) {
        setError(true);
        setLoading(false);
        return;
      }

      // Transformar datos para el gráfico
      const datosTransformados: DatosGrafico[] = resultado.historial.map((registro: RegistroHistorico) => ({
        fecha: registro.fecha,
        fechaFormateada: formatearFecha(registro.fecha),
        gasolina95: parsePrecio(registro.precios["Gasolina 95 E5"]),
        gasolina98: parsePrecio(registro.precios["Gasolina 98 E5"]),
        gasoleoA: parsePrecio(registro.precios["Gasóleo A"]),
        gasoleoB: parsePrecio(registro.precios["Gasóleo B"]),
        gasoleoPremium: parsePrecio(registro.precios["Gasóleo Premium"]),
      }));

      setDatos(datosTransformados);
      setLoading(false);
    };

    cargarHistorial();
  }, [ideess, dias]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          📊 Historial de Precios
        </h2>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#000C74] border-t-transparent mb-2"></div>
            <p className="text-gray-500 text-sm">Cargando historial...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          📊 Historial de Precios
        </h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            ℹ️ No hay datos históricos disponibles para este período.
          </p>
          <p className="text-yellow-600 text-xs mt-2">
            El historial se construye con cada sincronización. Vuelve más tarde para ver la evolución de precios.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-4 md:mb-0">
          📊 Historial de Precios
        </h2>
        
        {/* Selector de período */}
        <div className="flex gap-2">
          {[7, 30, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dias === d
                  ? "bg-[#000C74] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {/* Leyenda interactiva */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { key: "gasolina95" as const, label: "Gasolina 95 E5", color: "#22c55e" },
          { key: "gasolina98" as const, label: "Gasolina 98 E5", color: "#10b981" },
          { key: "gasoleoA" as const, label: "Gasóleo A", color: "#3b82f6" },
          { key: "gasoleoB" as const, label: "Gasóleo B", color: "#6366f1" },
          { key: "gasoleoPremium" as const, label: "Gasóleo Premium", color: "#8b5cf6" },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setCombustibleVisible(prev => ({ ...prev, [key]: !prev[key] }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              combustibleVisible[key]
                ? "bg-gray-100 text-gray-800"
                : "bg-gray-50 text-gray-400 opacity-50"
            }`}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: combustibleVisible[key] ? color : "#d1d5db" }}
            ></span>
            {label}
          </button>
        ))}
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={datos} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="fechaFormateada"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={{ stroke: "#e5e7eb" }}
            domain={["auto", "auto"]}
            label={{ value: "Precio (€/L)", angle: -90, position: "insideLeft", style: { fontSize: 12, fill: "#6b7280" } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "12px",
            }}
            formatter={(value: number) => [`${value.toFixed(3)} €/L`, ""]}
            labelFormatter={(label: string) => `Fecha: ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: "14px", paddingTop: "20px" }}
            iconType="line"
          />
          
          {combustibleVisible.gasolina95 && (
            <Line
              type="monotone"
              dataKey="gasolina95"
              stroke="#22c55e"
              strokeWidth={2}
              name="Gasolina 95 E5"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          )}
          {combustibleVisible.gasolina98 && (
            <Line
              type="monotone"
              dataKey="gasolina98"
              stroke="#10b981"
              strokeWidth={2}
              name="Gasolina 98 E5"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          )}
          {combustibleVisible.gasoleoA && (
            <Line
              type="monotone"
              dataKey="gasoleoA"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Gasóleo A"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          )}
          {combustibleVisible.gasoleoB && (
            <Line
              type="monotone"
              dataKey="gasoleoB"
              stroke="#6366f1"
              strokeWidth={2}
              name="Gasóleo B"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          )}
          {combustibleVisible.gasoleoPremium && (
            <Line
              type="monotone"
              dataKey="gasoleoPremium"
              stroke="#8b5cf6"
              strokeWidth={2}
              name="Gasóleo Premium"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
        {datos.length > 0 && (
          <>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Registros</p>
              <p className="text-xl font-bold text-gray-800">{datos.length}</p>
            </div>
            {combustibleVisible.gasolina95 && datos.some(d => d.gasolina95) && (
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Gasolina 95 Promedio</p>
                <p className="text-xl font-bold text-green-600">
                  {(datos.reduce((sum, d) => sum + (d.gasolina95 || 0), 0) / datos.filter(d => d.gasolina95).length).toFixed(3)} €
                </p>
              </div>
            )}
            {combustibleVisible.gasoleoA && datos.some(d => d.gasoleoA) && (
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Gasóleo A Promedio</p>
                <p className="text-xl font-bold text-blue-600">
                  {(datos.reduce((sum, d) => sum + (d.gasoleoA || 0), 0) / datos.filter(d => d.gasoleoA).length).toFixed(3)} €
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Período</p>
              <p className="text-xl font-bold text-gray-800">{dias} días</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
