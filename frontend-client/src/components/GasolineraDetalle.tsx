import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface Gasolinera {
  IDEESS: string;
  Rótulo: string;
  Municipio: string;
  Provincia: string;
  Latitud: number;
  Longitud: number;
  ["Precio Gasolina 95 E5"]: string;
  ["Precio Gasoleo A"]: string;
}

export default function GasolineraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [gasolinera, setGasolinera] = useState<Gasolinera | null>(null);
  const [cercanas, setCercanas] = useState<Gasolinera[]>([]);

  useEffect(() => {
    fetch(`http://localhost:8080/api/gasolineras/${id}`)
      .then(res => res.json())
      .then(data => setGasolinera(data))
      .catch(err => console.error(err));

    fetch(`http://localhost:8080/api/gasolineras/${id}/cercanas`)
      .then(res => res.json())
      .then(data => setCercanas(data.gasolineras_cercanas ?? []))
      .catch(err => console.error(err));
  }, [id]);

  if (!gasolinera) return <p className="p-6 text-gray-500">Cargando...</p>;

  const icon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconSize: [34, 34],
    iconAnchor: [17, 34]
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        ← Volver
      </button>

      {/* Card principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {gasolinera["Rótulo"]}
        </h1>

        <p className="text-gray-600 mt-1 text-sm">
          {gasolinera.Municipio}, {gasolinera.Provincia}
        </p>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex flex-col">
            <span className="text-gray-500 text-sm">Gasolina 95</span>
            <span className="text-2xl font-bold text-blue-700">
              {gasolinera["Precio Gasolina 95 E5"]}€
            </span>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex flex-col">
            <span className="text-gray-500 text-sm">Gasóleo A</span>
            <span className="text-2xl font-bold text-blue-700">
              {gasolinera["Precio Gasoleo A"]}€
            </span>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-blue-100">
        <MapContainer
          center={[gasolinera.Latitud, gasolinera.Longitud]}
          zoom={15}
          className="h-72 w-full"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[gasolinera.Latitud, gasolinera.Longitud]} icon={icon}>
            <Popup>{gasolinera["Rótulo"]}</Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Cercanas */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">
          Gasolineras cercanas
        </h2>

        <div className="grid gap-3">
          {cercanas.map(g => (
            <div
              key={g.IDEESS}
              onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
              className="p-4 bg-white border border-blue-100 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition"
            >
              <p className="font-medium text-gray-900">{g["Rótulo"]}</p>
              <p className="text-sm text-gray-600">{g.Municipio}</p>
              <p className="text-blue-700 font-semibold mt-1">
                {g["Precio Gasolina 95 E5"]}€ • {g["Precio Gasoleo A"]}€
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
