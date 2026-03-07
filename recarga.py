import requests
import json
import time

# --- CONFIGURACIÓN ---
URL_MARKERS = "https://www.mapareve.es/api/public/v1/markers"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json"
}

# Definimos las zonas de España (Lat_Min, Lat_Max, Lon_Min, Lon_Max)
ZONAS_ESPAÑA = [
    {"nombre": "Peninsula y Baleares", "lat_range": (35.0, 44.0), "lon_range": (-9.5, 4.5)},
    {"nombre": "Canarias", "lat_range": (27.5, 29.5), "lon_range": (-18.2, -13.3)}
]

# Tamaño del cuadro de escaneo (0.5 grados es seguro para evitar el error 2001)
STEP = 0.5 

def escanear_todo():
    puntos_unicos = {} # Usamos diccionario para evitar duplicados por ID
    
    print("🚀 Iniciando escaneo masivo de España...")
    
    for zona in ZONAS_ESPAÑA:
        print(f"\n--- Escaneando zona: {zona['nombre']} ---")
        lat = zona['lat_range'][0]
        
        while lat < zona['lat_range'][1]:
            lon = zona['lon_range'][0]
            while lon < zona['lon_range'][1]:
                
                payload = {
                    "latitude_ne": lat + STEP,
                    "longitude_ne": lon + STEP,
                    "latitude_sw": lat,
                    "longitude_sw": lon,
                    "zoom": 13,
                    "only_ocpi": False
                }
                
                try:
                    response = requests.post(URL_MARKERS, json=payload, headers=HEADERS, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        encontrados_en_cuadro = 0
                        
                        for item in data:
                            if item['type'] == 'location':
                                loc = item['location']
                                if loc['id'] not in puntos_unicos:
                                    puntos_unicos[loc['id']] = {
                                        "id": loc['id'],
                                        "name": loc['name'],
                                        "lat": loc['latitude'],
                                        "lng": loc['longitude'],
                                        "source": loc.get('source_type')
                                    }
                                    encontrados_en_cuadro += 1
                        
                        if encontrados_en_cuadro > 0:
                            print(f"📍 Cuadro [Lat {lat}, Lon {lon}]: {encontrados_en_cuadro} nuevos puntos.")
                    
                    elif response.status_code == 2001:
                        print(f"⚠️ Cuadro demasiado grande en Lat {lat}. Reduciendo paso...")
                        # Aquí se podría implementar una subdivisión, pero 0.5 suele ser seguro.
                    
                except Exception as e:
                    print(f"❌ Error en cuadro Lat {lat}, Lon {lon}: {e}")
                
                lon += STEP
                time.sleep(0.2) # Pausa mínima para no saturar
            lat += STEP

    # Guardar resultados
    print(f"\n✅ Escaneo finalizado. Total de puntos únicos encontrados: {len(puntos_unicos)}")
    
    with open("maestro_puntos_espana.json", "w", encoding="utf-8") as f:
        json.dump(list(puntos_unicos.values()), f, indent=4, ensure_ascii=False)
    
    print("💾 Archivo 'maestro_puntos_espana.json' guardado.")

if __name__ == "__main__":
    escanear_todo()