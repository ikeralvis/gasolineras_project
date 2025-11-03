"""
Servicio para obtener datos de gasolineras desde la API del Gobierno de España
"""
import os
import logging
import httpx
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# URL de la API del gobierno
API_URL = os.getenv(
    "GOBIERNO_API_URL",
    "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
)

# Timeout para las peticiones
REQUEST_TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))

def get_http_client() -> httpx.Client:
    """
    Crea un cliente httpx con configuración robusta para reconexiones y SSL
    """
    # httpx maneja automáticamente conexiones persistentes y reintentos
    transport = httpx.HTTPTransport(
        retries=5,  # Reintentos automáticos
        verify=False  # Desactivar verificación SSL (servidor del gobierno tiene problemas)
    )
    
    return httpx.Client(
        transport=transport,
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive"
        }
    )

def parse_float(value: str) -> Optional[float]:
    """
    Convierte un string a float manejando formatos españoles (comas)
    """
    if not value or value == "":
        return None
    try:
        return float(value.replace(",", "."))
    except (ValueError, AttributeError):
        return None

def parse_gasolinera(raw_data: Dict) -> Optional[Dict]:
    """
    Parsea un registro de gasolinera desde el formato de la API
    
    Args:
        raw_data: Diccionario con datos crudos de la API
    
    Returns:
        Diccionario con datos normalizados o None si hay error
    """
    try:
        return {
            "IDEESS": raw_data.get("IDEESS"),
            "Rótulo": raw_data.get("Rótulo", "").strip(),
            "Municipio": raw_data.get("Municipio", "").strip(),
            "Provincia": raw_data.get("Provincia", "").strip(),
            "Dirección": raw_data.get("Dirección", "").strip(),
            "Precio Gasolina 95 E5": raw_data.get("Precio Gasolina 95 E5", ""),
            "Precio Gasoleo A": raw_data.get("Precio Gasoleo A", ""),
            "Latitud": parse_float(raw_data.get("Latitud", "")),
            "Longitud": parse_float(raw_data.get("Longitud (WGS84)", "")),
        }
    except Exception as e:
        logger.warning(f"⚠️ Error procesando registro {raw_data.get('IDEESS')}: {e}")
        return None

def fetch_data_gobierno() -> List[Dict]:
    """
    Obtiene datos actualizados de gasolineras desde la API del gobierno
    
    Returns:
        Lista de diccionarios con los datos de gasolineras
    
    Raises:
        requests.RequestException: Si falla la petición HTTP
        ValueError: Si la respuesta no es válida
    """
    try:
        logger.info(f"🌐 Consultando API del gobierno: {API_URL}")
        
        with get_http_client() as client:
            response = client.get(API_URL)
            response.raise_for_status()
        
        # Parsear respuesta JSON
        json_data = response.json()
        
        if not isinstance(json_data, dict):
            raise ValueError("La respuesta de la API no es un objeto JSON válido")
        
        raw_list = json_data.get("ListaEESSPrecio", [])
        
        if not raw_list:
            logger.warning("⚠️ La API no devolvió datos")
            return []
        
        logger.info(f"📥 Recibidos {len(raw_list)} registros de la API")
        
        # Parsear y filtrar registros válidos
        gasolineras = []
        errores = 0
        
        for raw_item in raw_list:
            parsed = parse_gasolinera(raw_item)
            if parsed:
                gasolineras.append(parsed)
            else:
                errores += 1
        
        if errores > 0:
            logger.warning(f"⚠️ {errores} registros no pudieron procesarse")
        
        logger.info(f"✅ Procesadas {len(gasolineras)} gasolineras correctamente")
        
        return gasolineras
        
    except httpx.TimeoutException:
        logger.error(f"❌ Timeout al consultar la API (>{REQUEST_TIMEOUT}s)")
        raise
    except httpx.ConnectError as e:
        logger.error(f"❌ Error de conexión con la API: {e}")
        logger.info("💡 Intenta de nuevo en unos segundos, puede ser temporal")
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ Error HTTP {e.response.status_code}: {e}")
        raise
    except httpx.RequestError as e:
        logger.error(f"❌ Error en la petición: {e}")
        raise
    except ValueError as e:
        logger.error(f"❌ Error al parsear respuesta: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ Error inesperado: {e}")
        raise
