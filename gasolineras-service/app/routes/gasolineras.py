"""
Rutas de la API de Gasolineras
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
    
    **Atención:** Esta operación:
    - Elimina todos los datos existentes
    - Descarga datos actualizados desde la API oficial
    - Inserta los nuevos datos en la base de datos
    
    Puede tardar varios segundos en completarse.
    """
)
def sync_gasolineras():
    """Sincroniza datos desde la API del gobierno"""
    try:
        collection = get_collection()
        
        logger.info("🔄 Iniciando sincronización de gasolineras...")
        
        # Obtener datos de la API
        datos = fetch_data_gobierno()
        
        if not datos:
            logger.warning("⚠️ No se obtuvieron datos de la API")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No se pudieron obtener datos de la API del gobierno"
            )
        
        # Eliminar datos antiguos
        deleted_count = collection.delete_many({}).deleted_count
        logger.info(f"🗑️ Eliminados {deleted_count} registros antiguos")
        
        # Insertar nuevos datos
        result = collection.insert_many(datos)
        inserted_count = len(result.inserted_ids)
        
        logger.info(f"✅ Sincronización completada: {inserted_count} gasolineras")
        
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
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

