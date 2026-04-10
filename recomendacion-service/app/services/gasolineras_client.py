"""
Cliente para obtener datos de gasolineras.

Consume el endpoint GET /gasolineras del gateway, que ya expone los datos
normalizados del gasolineras-service.

Formato esperado de la respuesta:
  { "gasolineras": [ {...}, ... ], "total": N }
o una lista directa [ {...}, ... ]
"""
import logging
from typing import List, Optional

import httpx

from app.config import settings
from app.models.schemas import GasolineraInternal, COMBUSTIBLE_FIELD_MAP

logger = logging.getLogger(__name__)


def _parse_precio(raw: Optional[str]) -> Optional[float]:
    """Convierte cadenas de precio como '1.459' o '1,459' a float."""
    if not raw or not str(raw).strip():
        return None
    try:
        return float(str(raw).replace(",", ".").strip())
    except ValueError:
        return None


def _raw_to_internal(
    raw: dict, combustible: str
) -> Optional[GasolineraInternal]:
    """Convierte un dict del endpoint GET /api/gasolineras del gateway al modelo interno."""
    # Coordenadas (el campo puede venir como float o como string con coma decimal)
    def _coord(val) -> Optional[float]:
        if val is None:
            return None
        try:
            return float(str(val).replace(",", "."))
        except ValueError:
            return None

    lat = _coord(raw.get("Latitud") or raw.get("latitud"))
    lon = _coord(
        raw.get("Longitud (WGS84)")
        or raw.get("Longitud")
        or raw.get("longitud")
    )

    if lat is None or lon is None or lat == 0 or lon == 0:
        return None

    # Precio del combustible solicitado
    campo_precio = COMBUSTIBLE_FIELD_MAP.get(combustible, "Precio Gasolina 95 E5")
    precio_raw = raw.get(campo_precio)
    precio = _parse_precio(precio_raw)

    osm_highway = (
        raw.get("osm_highway")
        or raw.get("highway")
        or raw.get("osm:highway")
        or ""
    )
    service_area_flag = bool(
        raw.get("es_area_servicio")
        or raw.get("is_service_area")
        or raw.get("in_service_area")
    )

    normalized_name = str(raw.get("Rótulo") or raw.get("rotulo") or raw.get("nombre") or "").lower()
    normalized_address = str(raw.get("Dirección") or raw.get("direccion") or "").lower()
    inferred_service_area = "area de servicio" in normalized_name or "area de servicio" in normalized_address

    return GasolineraInternal(
        id=str(raw.get("IDEESS") or raw.get("ideess") or ""),
        nombre=str(raw.get("Rótulo") or raw.get("rotulo") or raw.get("nombre") or ""),
        direccion=str(
            raw.get("Dirección") or raw.get("direccion") or raw.get("Dirección") or ""
        ),
        municipio=str(raw.get("Municipio") or raw.get("municipio") or ""),
        provincia=str(raw.get("Provincia") or raw.get("provincia") or ""),
        lat=lat,
        lon=lon,
        precio=precio,
        horario=str(raw.get("Horario") or raw.get("horario") or ""),
        tipo_venta=str(raw.get("Tipo Venta") or raw.get("tipo_venta") or ""),
        osm_highway=str(osm_highway or "").strip() or None,
        es_area_servicio=service_area_flag or inferred_service_area,
    )


async def fetch_gasolineras(
    combustible: str,
    client: Optional[httpx.AsyncClient] = None,
) -> List[GasolineraInternal]:
    """
    Descarga la lista de gasolineras desde GASOLINERAS_API_URL (el gateway)
    y las devuelve normalizadas al modelo interno.
    """
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient()

    try:
        url = settings.GASOLINERAS_API_URL
        if "limit=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}limit=20000"

        logger.debug("Obteniendo gasolineras desde %s", url)
        try:
            resp = await client.get(url, timeout=settings.GASOLINERAS_TIMEOUT_S)
            resp.raise_for_status()
            data = resp.json()
            source = "gateway"
        except Exception as exc:
            logger.warning("Fuente gateway no disponible (%s). Usando fallback Ministerio...", exc)
            resp = await client.get(settings.GOBIERNO_API_URL, timeout=settings.GASOLINERAS_TIMEOUT_S)
            resp.raise_for_status()
            data = resp.json()
            source = "ministerio"

        if isinstance(data, list):
            raw_list = data
        elif isinstance(data, dict):
            raw_list = (
                data.get("gasolineras")
                or data.get("ListaEESSPrecio")
                or data.get("data")
                or data.get("results")
                or []
            )
        else:
            raw_list = []

        logger.info("Gasolineras recibidas desde %s: %d", source, len(raw_list))

        result = []
        for raw in raw_list:
            station = _raw_to_internal(raw, combustible)
            if station is not None:
                result.append(station)

        logger.debug("Gasolineras válidas con coordenadas: %d / %d", len(result), len(raw_list))
        return result

    except httpx.HTTPStatusError as exc:
        logger.error(
            "Error HTTP %s al obtener gasolineras de %s",
            exc.response.status_code,
            settings.GASOLINERAS_API_URL,
        )
        raise
    except Exception as exc:
        logger.error("Error al obtener gasolineras: %s", exc)
        raise
    finally:
        if own_client:
            await client.aclose()
