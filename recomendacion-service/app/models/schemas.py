"""
Schemas Pydantic para la API de recomendación de gasolineras.
"""
from __future__ import annotations
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List, Literal
from datetime import datetime


# ─────────────────────────────────────────────────────────────────────────────
# Tipos de combustible soportados
# ─────────────────────────────────────────────────────────────────────────────
CombustibleTipo = Literal[
    "gasolina_95",
    "gasolina_98",
    "gasoleo_a",
    "gasoleo_premium",
    "glp",
    "hidrogeno",
]

# Mapeo entre tipo de combustible y el campo en los datos de la API de gasolineras
COMBUSTIBLE_FIELD_MAP: dict[str, str] = {
    "gasolina_95": "Precio Gasolina 95 E5",
    "gasolina_98": "Precio Gasolina 98 E5",
    "gasoleo_a": "Precio Gasoleo A",
    "gasoleo_premium": "Precio Gasoleo Premium",
    "glp": "Precio Gases licuados del petróleo",
    "hidrogeno": "Precio Hidrogeno",
}


# ─────────────────────────────────────────────────────────────────────────────
# Request
# ─────────────────────────────────────────────────────────────────────────────
class Coordenada(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitud WGS84")
    lon: float = Field(..., ge=-180, le=180, description="Longitud WGS84")
    nombre: Optional[str] = Field(None, description="Nombre descriptivo del punto (opcional)")


class RecomendacionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    origen: Coordenada = Field(
        ...,
        description="Punto de partida",
        validation_alias=AliasChoices("origen", "origin"),
        serialization_alias="origen",
    )
    destino: Coordenada = Field(
        ...,
        description="Punto de llegada",
        validation_alias=AliasChoices("destino", "destination"),
        serialization_alias="destino",
    )
    posicion_actual: Optional[Coordenada] = Field(
        None,
        description="Posición GPS actual para descartar gasolineras por detrás de la ruta",
        validation_alias=AliasChoices("posicion_actual", "current_position"),
        serialization_alias="posicion_actual",
    )
    combustible: CombustibleTipo = Field(
        "gasolina_95",
        description="Tipo de combustible a comparar",
    )
    max_desvio_km: float = Field(
        5.0,
        gt=0,
        le=50,
        description="Desvío máximo tolerable en km respecto a la ruta directa",
    )
    max_desvio_min: Optional[float] = Field(
        None,
        gt=0,
        le=120,
        description="Tiempo extra máximo permitido por desvío (minutos)",
        validation_alias=AliasChoices("max_desvio_min", "max_detour_minutes", "max_detour_time"),
        serialization_alias="max_desvio_min",
    )
    top_n: int = Field(5, ge=1, le=100, description="Número de recomendaciones a devolver")
    peso_precio: float = Field(
        0.6,
        ge=0,
        le=1,
        description="Peso del precio en la puntuación final (0 = solo distancia, 1 = solo precio)",
    )
    peso_desvio: float = Field(
        0.4,
        ge=0,
        le=1,
        description="Peso del desvío en la puntuación final",
    )
    litros_deposito: Optional[float] = Field(
        None,
        gt=0,
        le=200,
        description="Litros del depósito para calcular ahorro estimado en €",
    )
    evitar_peajes: bool = Field(
        False,
        description="Evitar carreteras con peaje",
        validation_alias=AliasChoices("evitar_peajes", "avoid_tolls"),
        serialization_alias="evitar_peajes",
    )


    @model_validator(mode="after")
    def validate_weights(self) -> RecomendacionRequest:
        total = self.peso_precio + self.peso_desvio
        if abs(total - 1.0) > 0.01:
            # Normalizar automáticamente
            if total == 0:
                self.peso_precio = 0.6
                self.peso_desvio = 0.4
            else:
                self.peso_precio = self.peso_precio / total
                self.peso_desvio = self.peso_desvio / total
        return self


# ─────────────────────────────────────────────────────────────────────────────
# Datos internos de gasolinera (para el algoritmo)
# ─────────────────────────────────────────────────────────────────────────────
class GasolineraInternal(BaseModel):
    """Representación interna simplificada de una gasolinera."""
    id: Optional[str] = None
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    municipio: Optional[str] = None
    provincia: Optional[str] = None
    lat: float
    lon: float
    precio: Optional[float] = None          # en €/L para el combustible solicitado
    horario: Optional[str] = None
    tipo_venta: Optional[str] = None
    osm_highway: Optional[str] = None
    es_area_servicio: bool = False
    access_category: Optional[str] = None
    access_source: Optional[str] = None
    access_confidence: Optional[float] = None

    @property
    def tiene_precio(self) -> bool:
        return self.precio is not None and self.precio > 0


# ─────────────────────────────────────────────────────────────────────────────
# Response
# ─────────────────────────────────────────────────────────────────────────────
class RutaBase(BaseModel):
    distancia_km: float = Field(..., description="Distancia total de la ruta A→B en km")
    duracion_min: float = Field(..., description="Duración estimada de la ruta en minutos")
    coordinates: List[List[float]] = Field(
        default_factory=list,
        description="Geometría de la ruta en formato [lon, lat] para pintar sobre mapa",
    )
    origen: Coordenada
    destino: Coordenada


class GasolineraResumen(BaseModel):
    id: Optional[str] = None
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    municipio: Optional[str] = None
    provincia: Optional[str] = None
    lat: float
    lon: float
    horario: Optional[str] = None


class RecomendacionItem(BaseModel):
    posicion: int = Field(..., description="Ranking (1 = mejor recomendación)")
    gasolinera: GasolineraResumen
    precio_litro: float = Field(..., description="Precio del combustible en €/L")
    desvio_km: float = Field(..., description="Km de desvío respecto a la ruta directa")
    desvio_min_estimado: float = Field(
        ..., description="Minutos extra estimados por el desvío"
    )
    distancia_desde_origen_km: float = Field(
        ..., description="Km desde el origen hasta la gasolinera siguiendo la ruta"
    )
    porcentaje_ruta: float = Field(
        ..., description="En qué punto de la ruta se encuentra (0-100 %)"
    )
    score: float = Field(
        ..., ge=0, le=1, description="Puntuación compuesta [0-1], mayor es mejor"
    )
    ahorro_vs_mas_cara_eur: Optional[float] = Field(
        None,
        description="€ ahorrados vs la opción más cara del conjunto (requiere litros_deposito)",
    )
    diferencia_vs_mas_barata_eur_litro: Optional[float] = Field(
        None,
        description="Diferencia de precio con la gasolinera más barata en €/L",
    )
    tipo_acceso: Optional[str] = Field(
        None,
        description="Clasificación de acceso vial estimada (service_area, highway_exit, urban_local, unknown)",
    )
    fuente_tipo_acceso: Optional[str] = Field(
        None,
        description="Fuente de la clasificación de acceso (osm, mapbox, google)",
    )
    confianza_tipo_acceso: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Confianza de la clasificación de acceso [0-1]",
    )


class EstadisticasRuta(BaseModel):
    candidatos_evaluados: int
    precio_medio: float
    precio_min: float
    precio_max: float
    combustible: str


class GasolinerasDestacadas(BaseModel):
    mas_barata: Optional[RecomendacionItem] = Field(None, description="La gasolinera con el precio de combustible más bajo del top")
    mas_cercana: Optional[RecomendacionItem] = Field(None, description="La gasolinera con el menor desvío en km de la ruta directa")
    mejor_puntuada: Optional[RecomendacionItem] = Field(None, description="La mejor recomendación global equilibrando precio y desvío")


class RecomendacionResponse(BaseModel):
    ruta_base: RutaBase
    estadisticas: EstadisticasRuta
    destacadas: GasolinerasDestacadas
    recomendaciones: List[RecomendacionItem]
    opciones_parada: List[RecomendacionItem] = Field(
        default_factory=list,
        description="Tres opciones sugeridas para elegir parada: equilibrada, más barata y menor desvío",
    )
    metadata: dict = Field(
        default_factory=dict,
        description="Información sobre el backend de routing usado y timestamps",
    )
    geojson: dict = Field(
        default_factory=dict,
        description="FeatureCollection GeoJSON lista para pintar ruta y gasolineras",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Resultado interno de routing
# ─────────────────────────────────────────────────────────────────────────────
class RouteResult(BaseModel):
    distancia_m: float           # metros
    duracion_s: float            # segundos
    coordinates: list            # lista de [lon, lat]

    @property
    def distancia_km(self) -> float:
        return self.distancia_m / 1000

    @property
    def duracion_min(self) -> float:
        return self.duracion_s / 60
