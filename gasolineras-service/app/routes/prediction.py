"""
Endpoints de lectura de predicciones de precios.
Los datos los escribe el Cloud Run Job prediction-service; aquí solo los leemos.
"""
import logging
from fastapi import APIRouter, Query, HTTPException
from app.db.connection import get_db_conn, get_cursor, is_db_configured

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prediction", tags=["Predicción"])

MAX_STATIONS = 20


@router.get("/batch")
def get_predictions_batch(
    ideess: str = Query(..., description="IDs separados por coma, máx 20"),
):
    """
    Devuelve las predicciones de precio para los próximos 7 días de las
    estaciones indicadas.  Agrupa los resultados por IDEESS.

    Respuesta:
    {
      "by_station": { "<ideess>": [ { fuel, forecast_date, run_date,
                                      precio_predicho, margen_min, margen_max } ] },
      "run_date": "YYYY-MM-DD"
    }
    """
    if not is_db_configured():
        raise HTTPException(status_code=503, detail="Base de datos no configurada")

    ids = [i.strip() for i in ideess.split(",") if i.strip()][:MAX_STATIONS]
    if not ids:
        raise HTTPException(status_code=400, detail="Parámetro 'ideess' requerido")

    try:
        with get_db_conn() as conn:
            with get_cursor(conn) as cur:
                cur.execute(
                    """
                    SELECT
                        ideess,
                        fuel,
                        forecast_date::text  AS forecast_date,
                        run_date::text       AS run_date,
                        precio_predicho::float,
                        margen_min::float,
                        margen_max::float
                    FROM prediction_forecasts
                    WHERE ideess = ANY(%s)
                      AND forecast_date >= CURRENT_DATE
                    ORDER BY ideess, fuel, forecast_date
                    """,
                    (ids,),
                )
                rows = cur.fetchall()
    except Exception as exc:
        logger.error("Error consultando prediction_forecasts: %s", exc)
        raise HTTPException(status_code=500, detail="Error interno") from exc

    by_station: dict[str, list] = {}
    run_date: str | None = None

    for row in rows:
        d = dict(row)
        station_id = d["ideess"]
        if station_id not in by_station:
            by_station[station_id] = []
        by_station[station_id].append(d)
        if run_date is None:
            run_date = d.get("run_date")

    return {"by_station": by_station, "run_date": run_date}


@router.get("/health")
def prediction_health():
    return {"status": "ok"}
