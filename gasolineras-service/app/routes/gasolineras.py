"""
Rutas de la API de Gasolineras - VERSIÓN DEBUG
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, status
from app.db.connection import get_collection
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
            query["Municipio"] = {"$regex": municipio, "$options": "i"}
        if precio_max:
            query["Precio Gasolina 95 E5"] = {"$lte": str(precio_max)}
        
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

@router.post(
    "/sync",
    response_model=dict,
    summary="Sincronizar gasolineras",
    description="""
    Sincroniza los datos de gasolineras desde la API del Gobierno de España.
    
    Atención:
    - Elimina todos los datos existentes
    - Descarga datos actualizados desde la API oficial
    - Inserta los nuevos datos en la base de datos
    
    Puede tardar varios segundos.
    """
)
def sync_gasolineras():
    try:
        logger.info("🔄 Iniciando sincronización de gasolineras...")
        
        collection = get_collection()  # Sin argumentos

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
            logger.info(f"🔍 DEBUG - Primer registro:")
            logger.info(f"  Keys disponibles: {list(primer_registro.keys())}")
            logger.info(f"  IDEESS: {primer_registro.get('IDEESS')}")
            logger.info(f"  Latitud: {primer_registro.get('Latitud')} (tipo: {type(primer_registro.get('Latitud'))})")
            logger.info(f"  Longitud: {primer_registro.get('Longitud')} (tipo: {type(primer_registro.get('Longitud'))})")

        datos_normalizados = []
        registros_filtrados = 0

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
            logger.error(f"❌ CRÍTICO: datos_normalizados está vacío!")
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

        return {
            "mensaje": "Datos sincronizados correctamente 🚀",
            "registros_eliminados": deleted_count,
            "registros_insertados": inserted_count,
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

@router.get("/cerca")
def gasolineras_cerca(
    lat: float = Query(...),
    lon: float = Query(...),
    km: float = Query(5, description="Radio en kilómetros"),
):
    collection = get_collection()

    gasolineras = list(collection.find({
        "location": {
            "$near": {
                "$geometry": { "type": "Point", "coordinates": [lon, lat] },
                "$maxDistance": km * 1000  # metros
            }
        }
    }, {"_id": 0}))

    return {
        "count": len(gasolineras),
        "gasolineras": gasolineras
    }