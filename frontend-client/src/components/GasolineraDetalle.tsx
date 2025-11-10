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

  if (!gasolinera) return <p className="p-4">Cargando...</p>;

  const icon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconSize: [38, 38],
    iconAnchor: [19, 38]
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      
      {/* Card principal */}
      <div className="bg-white shadow-md rounded-2xl p-5 border border-gray-100">
        <h1 className="text-3xl font-bold text-green-700">
          {gasolinera["Rótulo"]}
        </h1>
        <p className="text-gray-600 text-sm mt-1">
          {gasolinera.Municipio}, {gasolinera.Provincia}
        </p>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <span className="block text-gray-600 text-sm">Gasolina 95</span>
            <span className="text-xl font-semibold text-green-700">
              {gasolinera["Precio Gasolina 95 E5"]} €
            </span>
          </div>

          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <span className="block text-gray-600 text-sm">Gasóleo A</span>
            <span className="text-xl font-semibold text-green-700">
              {gasolinera["Precio Gasoleo A"]} €
            </span>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-200">
        <MapContainer
          center={[gasolinera.Latitud, gasolinera.Longitud]}
          zoom={15}
          className="h-80 w-full"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[gasolinera.Latitud, gasolinera.Longitud]} icon={icon}>
            <Popup>{gasolinera["Rótulo"]}</Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Gasolineras cercanas */}
      <div>
        <h2 className="text-xl font-semibold text-green-700 mb-3">
          Gasolineras cercanas
        </h2>

        <div className="grid gap-3">
          {cercanas.map(g => (
            <div
              key={g.IDEESS}
              onClick={() => navigate(`/gasolinera/${g.IDEESS}`)}
              className="p-4 bg-white border border-gray-200 rounded-xl shadow hover:shadow-md cursor-pointer transition"
            >
              <p className="font-medium text-gray-800">{g["Rótulo"]}</p>
              <p className="text-sm text-gray-500">{g.Municipio}</p>
              <p className="text-green-700 font-semibold mt-1">
                {g["Precio Gasolina 95 E5"]} € • {g["Precio Gasoleo A"]} €
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
