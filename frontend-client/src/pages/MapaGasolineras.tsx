import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";

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
    Latitud: number;
    Longitud: number;
    ["Precio Gasolina 95 E5"]: string;
    ["Precio Gasoleo A"]: string;
}

function createIcon(imageUrl: string) {
    return new L.Icon({
        iconUrl: imageUrl,
        iconSize: [35, 35],
        iconAnchor: [18, 35],
        popupAnchor: [0, -28],
    });
}


// Detecta marca desde el nombre del rótulo
function getBrandIcon(rotulo: string) {
    const name = rotulo.toLowerCase();

    if (name.includes("repsol")) return repsol;
    if (name.includes("cepsa")) return cepsa;
    if (name.includes("bp")) return bp;
    if (name.includes("shell")) return shell;
    if (name.includes("galp")) return galp;
    if (name.includes("eroski")) return eroski;
    if (name.includes("moeve")) return moeve;

    return "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"; // fallback
}

export default function MapaGasolineras() {
    const [gasolineras, setGasolineras] = useState<Gasolinera[]>([]);

    useEffect(() => {
        fetch("http://localhost:8080/api/gasolineras")
            .then((res) => res.json())
            .then((data) => setGasolineras(data.gasolineras)) // ← aquí el fix
            .catch((err) => console.error("Error cargando gasolineras:", err));
    }, []);

    return (
        <div className="w-full h-[calc(100vh-64px)] flex flex-col">
            {/* Filtros (simple placeholder por ahora) */}
            <div className="p-4 bg-white shadow z-10">
                <h2 className="text-xl font-semibold text-gray-800">Mapa de Gasolineras</h2>
                <p className="text-gray-500 text-sm">Usa el mapa para explorar.</p>
            </div>

            <MapContainer
                center={[40.4168, -3.7038]} // Centro España
                zoom={6}
                className="flex-1"
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="© OpenStreetMap contributors"
                />

                {gasolineras.map((g) => {
                    const icon = createIcon(getBrandIcon(g["Rótulo"]));

                    return (
                        <Marker
                            key={g.IDEESS}
                            position={[g.Latitud, g.Longitud]}
                            icon={icon}
                        >
                            <Popup>
                                <div className="text-sm">
                                    <strong>{g["Rótulo"]}</strong> <br />
                                    {g.Municipio} ({g.Provincia}) <br />
                                    <br />
                                    Gasolina 95: {g["Precio Gasolina 95 E5"]} € <br />
                                    Gasóleo A: {g["Precio Gasoleo A"]} €
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
