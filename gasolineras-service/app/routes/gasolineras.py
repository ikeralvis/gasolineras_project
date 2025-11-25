"""
Rutas de la API de Gasolineras - VERSIÓN DEBUG
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException, status
from app.db.connection import get_collection, get_historico_collection

PRECIO_GASOLINA_95_E5 = "Precio Gasolina 95 E5"
from app.services.fetch_gobierno import fetch_data_gobierno
from app.models.gasolinera import Gasolinera

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gasolineras", tags=["Gasolineras"])

@router.get(
    "/",
    response_model=dict,
    summary="Obtener gasolineras",
    description="""
    Obtiene la lista de gasolineras con soporte para filtros y paginación.
    
    **Filtros disponibles:**
    - provincia: Filtra por provincia
    - municipio: Filtra por municipio
    - precio_max: Precio máximo de gasolina 95
    
    **Paginación:**
    - skip: Número de elementos a saltar (default: 0)
    - limit: Número máximo de elementos a devolver (default: 100, max: 1000)
    """
)
def get_gasolineras(
    provincia: Optional[str] = Query(None, description="Filtrar por provincia"),
    municipio: Optional[str] = Query(None, description="Filtrar por municipio"),
    precio_max: Optional[float] = Query(None, description="Precio máximo gasolina 95"),
    skip: int = Query(0, ge=0, description="Elementos a saltar"),
    limit: int = Query(100, ge=1, le=1000, description="Número máximo de resultados")
):
    """Obtiene la lista de gasolineras con filtros opcionales"""
    try:
        collection = get_collection()
        
        # Construir query de filtros
        query = {}
        if provincia:
            query["Provincia"] = {"$regex": provincia, "$options": "i"}
        if municipio:
            query[PRECIO_GASOLINA_95_E5] = {"$lte": str(precio_max)}
        if precio_max:
            query[PRECIO_GASOLINA_95_E5] = {"$lte": str(precio_max)}
        
        # Contar total
        total = collection.count_documents(query)
        
        # Obtener datos con paginación
        gasolineras_list = list(
            collection.find(query, {"_id": 0})
            .skip(skip)
            .limit(limit)
        )
        
        logger.info(f"📊 Consultadas {len(gasolineras_list)} gasolineras (total: {total})")
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "count": len(gasolineras_list),
            "gasolineras": gasolineras_list
        }
        
    except Exception as e:
        logger.error(f"❌ Error al obtener gasolineras: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar las gasolineras: {str(e)}"
        )

@router.get(
    "/cerca",
    summary="Obtener gasolineras cercanas a una ubicación",
    description="Devuelve gasolineras cercanas a las coordenadas indicadas ordenadas por distancia"
)
def gasolineras_cerca(
    lat: float = Query(..., description="Latitud", ge=-90, le=90),
    lon: float = Query(..., description="Longitud", ge=-180, le=180),
    km: float = Query(50, description="Radio en kilómetros", gt=0, le=200),
    limit: int = Query(100, description="Número máximo de resultados", ge=1, le=500)
):
    """Obtiene gasolineras cercanas a una ubicación específica"""
    try:
        collection = get_collection()
        
        # Asegurar índice geoespacial
        collection.create_index([("location", "2dsphere")])
        
        logger.info(f"📍 Buscando gasolineras cerca de ({lat}, {lon}) en radio de {km}km")
        
        # Usar aggregation con $geoNear para búsqueda geoespacial
        gasolineras = list(collection.aggregate([
            {
                "$geoNear": {
                    "near": {
                        "type": "Point",
                        "coordinates": [lon, lat]  # GeoJSON: [longitud, latitud]
                    },
                    "distanceField": "distancia",
                    "maxDistance": km * 1000,  # Convertir km a metros
                    "spherical": True,
                    "key": "location"
                }
            },
            {"$limit": limit},
            {"$project": {"_id": 0}}  # Excluir campo _id
        ]))
        
        logger.info(f"✅ Encontradas {len(gasolineras)} gasolineras cercanas")
        
        return {
            "ubicacion": {"lat": lat, "lon": lon},
            "radio_km": km,
            "count": len(gasolineras),
            "gasolineras": gasolineras
        }
        
    except Exception as e:
        logger.error(f"❌ Error al buscar gasolineras cercanas: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al buscar gasolineras cercanas: {str(e)}"
        )

@router.post(
    "/sync",
    response_model=dict,
    summary="Sincronizar gasolineras",
    description="""
    Sincroniza los datos de gasolineras desde la API del Gobierno de España.
    
    Atención:
    - Elimina todos los datos existentes de gasolineras actuales
    - Descarga datos actualizados desde la API oficial
    - Inserta los nuevos datos en la base de datos
    - Guarda snapshot en histórico de precios con timestamp
    
    Puede tardar varios segundos.
    """
)
def sync_gasolineras():
    try:
        logger.info("🔄 Iniciando sincronización de gasolineras...")
        
        collection = get_collection()  # Sin argumentos
        historico_collection = get_historico_collection()

        datos = fetch_data_gobierno()
        if not datos:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No se pudieron obtener datos desde la API del gobierno"
            )

        logger.info(f"📦 Datos recibidos de fetch_data_gobierno: {len(datos)} registros")

        deleted_count = collection.delete_many({}).deleted_count
        logger.info(f"🗑️ Eliminados {deleted_count} registros antiguos")

        # DEBUG: Mostrar el primer registro
        if datos:
            primer_registro = datos[0]
            logger.info("🔍 DEBUG - Primer registro:")
            logger.info(f"  Keys disponibles: {list(primer_registro.keys())}")
            logger.info(f"  IDEESS: {primer_registro.get('IDEESS')}")
            logger.info(f"  Latitud: {primer_registro.get('Latitud')} (tipo: {type(primer_registro.get('Latitud'))})")
            logger.info(f"  Longitud: {primer_registro.get('Longitud')} (tipo: {type(primer_registro.get('Longitud'))})")

        datos_normalizados = []
        registros_filtrados = 0
        fecha_sync = datetime.now(timezone.utc)

        for idx, g in enumerate(datos):
            lat = g.get("Latitud")
            lon = g.get("Longitud")


            # DEBUG: Mostrar los primeros 3 registros
            if idx < 3:
                logger.info(f"🔍 DEBUG - Registro {idx}:")
                logger.info(f"  Latitud: {lat} (es None: {lat is None})")
                logger.info(f"  Longitud: {lon} (es None: {lon is None})")

            if lat is None or lon is None:
                registros_filtrados += 1
                continue

            g["location"] = {
                "type": "Point",
                "coordinates": [lon, lat]  # GeoJSON → [longitud, latitud]
            }

            datos_normalizados.append(g)
        
        logger.info(f"🔢 Procesados: {len(datos)}. Filtrados por coordenadas: {registros_filtrados}. Válidos para insertar: {len(datos_normalizados)}")

        if not datos_normalizados:
            logger.error("❌ CRÍTICO: datos_normalizados está vacío!")
            logger.error(f"   Total recibidos: {len(datos)}")
            logger.error(f"   Total filtrados: {registros_filtrados}")
            raise HTTPException(
                status_code=500,
                detail="No se encontraron gasolineras con coordenadas válidas"
            )

        result = collection.insert_many(datos_normalizados)

        # Índice espacial para búsquedas cercanas
        collection.create_index([("location", "2dsphere")])

        inserted_count = len(result.inserted_ids)

        logger.info(f"✅ Insertadas {inserted_count} gasolineras nuevas")
        
        # Guardar snapshot en histórico (solo si no existe ya hoy)
        fecha_hoy = fecha_sync.replace(hour=0, minute=0, second=0, microsecond=0)
        
        documentos_historicos = []
        for g in datos_normalizados:
            # Extraer solo precios relevantes
            doc_historico = {
                "IDEESS": g.get("IDEESS"),
                    "Gasolina 95 E5": g.get(PRECIO_GASOLINA_95_E5),
                "precios": {
                    "Gasolina 95 E5": g.get(PRECIO_GASOLINA_95_E5),
                    "Gasolina 98 E5": g.get("Precio Gasolina 98 E5"),
                    "Gasóleo A": g.get("Precio Gasoleo A"),
                    "Gasóleo B": g.get("Precio Gasoleo B"),
                    "Gasóleo Premium": g.get("Precio Gasóleo Premium"),
                }
            }
            documentos_historicos.append(doc_historico)
        
        # Eliminar registros del mismo día si existen (evitar duplicados)
        historico_collection.delete_many({"fecha": fecha_hoy})
        
        # Insertar nuevos registros históricos
        if documentos_historicos:
            historico_result = historico_collection.insert_many(documentos_historicos)
            historico_count = len(historico_result.inserted_ids)
            logger.info(f"📊 Guardados {historico_count} registros en histórico para {fecha_hoy.date()}")
        
        return {
            "mensaje": "Datos sincronizados correctamente 🚀",
            "registros_eliminados": deleted_count,
            "registros_insertados": inserted_count,
            "registros_historicos": len(documentos_historicos),
            "fecha_snapshot": fecha_hoy.isoformat(),
            "total": inserted_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al sincronizar gasolineras: {e}")
        import traceback
        logger.error(f"Traceback completo: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Error al sincronizar datos: {str(e)}"
        )

@router.get(
    "/count",
    response_model=dict,
    summary="Contar gasolineras",
    description="Obtiene el número total de gasolineras en la base de datos"
)
def count_gasolineras():
    """Cuenta el número total de gasolineras"""
    try:
        collection = get_collection()
        total = collection.count_documents({})
        
        return {
            "total": total,
            "mensaje": f"Total de gasolineras: {total}"
        }
        
    except Exception as e:
        logger.error(f"❌ Error al contar gasolineras: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al contar gasolineras: {str(e)}"
        )

@router.get(
    "/estadisticas",
    response_model=dict,
    summary="Obtener estadísticas de precios",
    description="""
    Calcula estadísticas de precios de combustibles:
    - Precio medio, mínimo, máximo
    - Percentiles 25, 50 (mediana), 75
    - Total de gasolineras analizadas
    
    Los percentiles se usan para determinar umbrales:
    - P25: Precio considerado "bajo"
    - P75: Precio considerado "alto"
    """
)
def obtener_estadisticas(
    provincia: Optional[str] = Query(None, description="Filtrar por provincia"),
    municipio: Optional[str] = Query(None, description="Filtrar por municipio"),
):
    """Calcula estadísticas de precios de combustibles"""
    try:
        collection = get_collection()
        
        # Construir query de filtros
        query = {}
        if provincia:
            query["Provincia"] = {"$regex": provincia, "$options": "i"}
        if municipio:
            query["Municipio"] = {"$regex": municipio, "$options": "i"}
        
        gasolineras = list(collection.find(query, {"_id": 0}))
        total = len(gasolineras)
        
        if total == 0:
            raise HTTPException(
                status_code=404,
                detail="No se encontraron gasolineras con los filtros especificados"
            )
        
        def calcular_estadisticas(campo: str):
            """Calcula estadísticas para un tipo de combustible"""
            precios = []
            for g in gasolineras:
                precio_str = g.get(campo, "")
                if precio_str and precio_str.strip():
                    try:
                        precio = float(precio_str.replace(",", "."))
                        if precio > 0:
                            precios.append(precio)
                    except ValueError:
                        continue
            
            if not precios:
                return None
            
            precios.sort()
            n = len(precios)
            
            return {
                "min": round(precios[0], 3),
                "max": round(precios[-1], 3),
                "media": round(sum(precios) / n, 3),
                "mediana": round(precios[n // 2], 3),
                "p25": round(precios[n // 4], 3),  # Percentil 25 (precio bajo)
                "p75": round(precios[n * 3 // 4], 3),  # Percentil 75 (precio alto)
                "total_muestras": n
            }
        
        estadisticas = {
            "total_gasolineras": total,
            "filtros": {
                "provincia": provincia,
                "municipio": municipio
            },
            "combustibles": {
                "gasolina_95": calcular_estadisticas("Precio Gasolina 95 E5"),
                "gasolina_98": calcular_estadisticas("Precio Gasolina 98 E5"),
                "gasoleo_a": calcular_estadisticas("Precio Gasoleo A"),
                "gasoleo_b": calcular_estadisticas("Precio Gasoleo B"),
                "gasoleo_premium": calcular_estadisticas("Precio Gasóleo Premium"),
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Filtrar combustibles sin datos
        estadisticas["combustibles"] = {
            k: v for k, v in estadisticas["combustibles"].items() if v is not None
        }
        
        logger.info(f"📊 Estadísticas calculadas para {total} gasolineras")
        
        return estadisticas
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al calcular estadísticas: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al calcular estadísticas: {str(e)}"
        )

@router.get(
    "/{id}",
    response_model=Gasolinera,
    summary="Obtener detalles de una gasolinera por ID"
)
def get_gasolinera_por_id(id: str):
    try:
        collection = get_collection()
        gasolinera = collection.find_one({"IDEESS": id}, {"_id": 0})
        
        if not gasolinera:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontró gasolinera con ID {id}"
            )
        
        return gasolinera
    
    except Exception as e:
        logger.error(f"❌ Error al obtener gasolinera {id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno al consultar la gasolinera: {str(e)}"
        )

@router.get(
    "/{id}/cercanas",
    summary="Obtener gasolineras cercanas",
    description="Devuelve gasolineras ordenadas por distancia respecto a la gasolinera indicada")
def get_gasolineras_cercanas(id: str, radio_km: float = 5):
    try:
        collection = get_collection()

        # Asegurar el índice geoespacial
        collection.create_index([("location", "2dsphere")])

        gas = collection.find_one({"IDEESS": id})
        if not gas:
            raise HTTPException(status_code=404, detail=f"No se encontró gasolinera con ID {id}")

        lat = float(gas["Latitud"])
        lon = float(gas["Longitud"])

        cercanas = list(collection.aggregate([
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [lon, lat]},
                    "distanceField": "distancia",
                    "maxDistance": radio_km * 1000,
                    "spherical": True
                }
            },
            {"$match": {"IDEESS": {"$ne": id}}},
            {"$sort": {"distancia": 1}},
            {"$limit": 10},
            {"$project": {"_id": 0}}
        ]))

        return {
            "origen": id,
            "radio_km": radio_km,
            "cantidad": len(cercanas),
            "gasolineras_cercanas": cercanas
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al obtener gasolineras cercanas para {id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar gasolineras cercanas: {str(e)}"
        )

@router.get(
    "/{id}/historial",
    summary="Obtener historial de precios",
    description="""
    Devuelve el historial de precios de una gasolinera en el período especificado.
    
    Parámetros:
    - id: Identificador de la gasolinera (IDEESS)
    - dias: Número de días hacia atrás (por defecto 30)
    
    Retorna un array con los precios por fecha, ordenados cronológicamente.
    """
)
def get_historial_precios(id: str, dias: int = Query(default=30, ge=1, le=365)):
    try:
        historico_collection = get_historico_collection()
        
        # Calcular fecha de inicio
        fecha_limite = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        fecha_inicio = fecha_limite - timedelta(days=dias)
        
        # Consultar histórico
        registros = list(historico_collection.find(
            {
                "IDEESS": id,
                "fecha": {"$gte": fecha_inicio, "$lte": fecha_limite}
            },
            {"_id": 0}
        ).sort("fecha", 1))  # Orden cronológico ascendente
        
        if not registros:
            # Verificar si la gasolinera existe
            collection = get_collection()
            gasolinera = collection.find_one({"IDEESS": id})
            if not gasolinera:
                raise HTTPException(
                    status_code=404,
                    detail=f"No se encontró gasolinera con ID {id}"
                )
            
            return {
                "IDEESS": id,
                "dias_consultados": dias,
                "fecha_desde": fecha_inicio.isoformat(),
                "fecha_hasta": fecha_limite.isoformat(),
                "registros": 0,
                "mensaje": "No hay datos históricos disponibles para este período",
                "historial": []
            }
        
        # Formatear fechas para mejor legibilidad
        for registro in registros:
            if "fecha" in registro and isinstance(registro["fecha"], datetime):
                registro["fecha"] = registro["fecha"].isoformat()
        
        return {
            "IDEESS": id,
            "dias_consultados": dias,
            "fecha_desde": fecha_inicio.isoformat(),
            "fecha_hasta": fecha_limite.isoformat(),
            "registros": len(registros),
            "historial": registros
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error al obtener historial de precios para {id}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar historial: {str(e)}"
        )
