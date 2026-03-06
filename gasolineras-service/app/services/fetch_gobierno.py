"""
Servicio para obtener datos de gasolineras desde la API del Gobierno de España
"""
import os
import re
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
    transport = httpx.HTTPTransport(
        retries=5,
        verify=False
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
        # Manejar caso donde value no es string
        if not isinstance(value, str):
            return float(value)
        cleaned_value = value.replace(",", ".")
        return float(cleaned_value)
    except (ValueError, AttributeError, TypeError) as e:
        logger.warning(f"⚠️ No se pudo parsear a float el valor: '{value}' tipo: {type(value)} (Error: {e})")
        return None

# ---------------------------------------------------------------------------
# Horario parser
# ---------------------------------------------------------------------------

# Abreviaturas de días españolas → número ISO (1=Lunes, 7=Domingo)
_DIA_A_ISO: dict[str, int] = {
    "L": 1,  # Lunes
    "M": 2,  # Martes
    "X": 3,  # Miércoles
    "J": 4,  # Jueves
    "V": 5,  # Viernes
    "S": 6,  # Sábado
    "D": 7,  # Domingo
}


def _expand_dias(dias_str: str) -> list[int]:
    """
    Expande una expresión de días al listado ISO.
    Ejemplos: 'L-V' → [1,2,3,4,5], 'L' → [1], 'L,M,S' → [1,2,6]
    """
    dias_str = dias_str.strip().upper()
    # Rango tipo L-V (exactamente 3 chars: letra-guion-letra)
    m = re.match(r'^([LMXJVSD])-([LMXJVSD])$', dias_str)
    if m:
        s, e = _DIA_A_ISO.get(m.group(1)), _DIA_A_ISO.get(m.group(2))
        if s and e:
            if s <= e:
                return list(range(s, e + 1))
            # Caso raro: D-L (semana circular)
            return list(range(s, 8)) + list(range(1, e + 1))
    # Lista separada por comas: L,M,S
    if "," in dias_str:
        return [_DIA_A_ISO[d.strip()] for d in dias_str.split(",") if d.strip() in _DIA_A_ISO]
    # Día suelto
    iso = _DIA_A_ISO.get(dias_str)
    return [iso] if iso else []


def parse_horario(raw: Optional[str]) -> Optional[dict]:
    """
    Parsea el campo Horario de la API del gobierno a JSON estructurado.

    Formatos soportados:
        "L-D: 07:00-22:00"
        "L-V: 06:00-22:00; S-D: 08:00-15:00"
        "24H" / "24 horas"
        "" / None → None

    Devuelve:
        {
          "texto": "L-D: 07:00-22:00",
          "siempre_abierto": False,
          "segmentos": [
            {"dias": [1,2,3,4,5,6,7], "apertura": "07:00", "cierre": "22:00"}
          ]
        }
    """
    if not raw or not raw.strip():
        return None
    texto = raw.strip()

    # 24H / siempre abierto
    if re.match(r'^24\s*[Hh]', texto):
        return {"texto": texto, "siempre_abierto": True, "segmentos": []}

    segmentos = []
    for parte in texto.split(";"):
        parte = parte.strip()
        if not parte:
            continue
        # Segmento: "L-D: 07:00-22:00"  o  "L,M,X: 08:00-20:00"
        m = re.match(
            r'^([LMXJVSD][LMXJVSD,\-]*)\s*:\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$',
            parte,
            re.IGNORECASE,
        )
        if m:
            dias = _expand_dias(m.group(1))
            if dias:
                segmentos.append({
                    "dias": dias,
                    "apertura": m.group(2),
                    "cierre": m.group(3),
                })
        else:
            logger.debug(f"Segmento de horario no reconocido: '{parte}'")

    return {"texto": texto, "siempre_abierto": False, "segmentos": segmentos}


# ---------------------------------------------------------------------------

def parse_gasolinera(raw_data: Dict) -> Optional[Dict]:
    """
    Parsea un registro de gasolinera desde el formato de la API
    """
    try:
        lat_raw = raw_data.get("Latitud", "")
        lon_raw = raw_data.get("Longitud (WGS84)", "")
        horario_raw = raw_data.get("Horario", "")

        parsed_data = {
            "IDEESS": raw_data.get("IDEESS"),
            "Rótulo": raw_data.get("Rótulo", "").strip(),
            "Municipio": raw_data.get("Municipio", "").strip(),
            "Provincia": raw_data.get("Provincia", "").strip(),
            "Dirección": raw_data.get("Dirección", "").strip(),
            "Precio Gasolina 95 E5": raw_data.get("Precio Gasolina 95 E5", ""),
            "Precio Gasolina 98 E5": raw_data.get("Precio Gasolina 98 E5", ""),
            "Precio Gasoleo A": raw_data.get("Precio Gasoleo A", ""),
            "Precio Gasoleo B": raw_data.get("Precio Gasoleo B", ""),
            "Precio Gasóleo Premium": raw_data.get("Precio Gasóleo Premium", ""),
            "Latitud": parse_float(lat_raw),
            "Longitud": parse_float(lon_raw),
            "Horario": horario_raw.strip() if horario_raw else None,
            "Horario_parsed": parse_horario(horario_raw),
        }

        return parsed_data

    except Exception as e:
        logger.warning(f"⚠️ Error procesando registro {raw_data.get('IDEESS')}: {e}")
        return None

def fetch_data_gobierno() -> List[Dict]:
    """
    Obtiene datos actualizados de gasolineras desde la API del gobierno
    """
    try:
        logger.info(f"🌐 Consultando API del gobierno: {API_URL}")
        
        with get_http_client() as client:
            response = client.get(API_URL)
            response.raise_for_status()
        
        json_data = response.json()
        
        if not isinstance(json_data, dict):
            raise ValueError("La respuesta de la API no es un objeto JSON válido")
        
        raw_list = json_data.get("ListaEESSPrecio", [])
        
        if not raw_list:
            logger.warning("⚠️ La API no devolvió datos")
            return []
        
        logger.info(f"📥 Recibidos {len(raw_list)} registros de la API")
        
        # DEBUG: Mostrar un registro de ejemplo
        if raw_list:
            ejemplo = raw_list[0]
            logger.info(f"🔍 Ejemplo de registro crudo:")
            logger.info(f"  - IDEESS: {ejemplo.get('IDEESS')}")
            logger.info(f"  - Latitud (crudo): '{ejemplo.get('Latitud')}' (tipo: {type(ejemplo.get('Latitud'))})")
            logger.info(f"  - Longitud (crudo): '{ejemplo.get('Longitud (WGS84)')}' (tipo: {type(ejemplo.get('Longitud (WGS84)'))})")
        
        # Parsear y filtrar registros válidos
        gasolineras = []
        errores = 0
        sin_coordenadas = 0
        
        for raw_item in raw_list:
            parsed = parse_gasolinera(raw_item)
            if parsed:
                # Verificar si tiene coordenadas válidas
                if parsed.get("Latitud") is None or parsed.get("Longitud") is None:
                    sin_coordenadas += 1
                gasolineras.append(parsed)
            else:
                errores += 1
        
        if errores > 0:
            logger.warning(f"⚠️ {errores} registros no pudieron procesarse")
        
        logger.info(f"✅ Procesadas {len(gasolineras)} gasolineras correctamente")
        logger.info(f"📍 Registros sin coordenadas: {sin_coordenadas}")
        
        # Mostrar un ejemplo parseado
        if gasolineras:
            ejemplo_parseado = gasolineras[0]
            logger.info(f"🔍 Ejemplo parseado:")
            logger.info(f"  - IDEESS: {ejemplo_parseado.get('IDEESS')}")
            logger.info(f"  - Latitud: {ejemplo_parseado.get('Latitud')} (tipo: {type(ejemplo_parseado.get('Latitud'))})")
            logger.info(f"  - Longitud: {ejemplo_parseado.get('Longitud')} (tipo: {type(ejemplo_parseado.get('Longitud'))})")
        
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