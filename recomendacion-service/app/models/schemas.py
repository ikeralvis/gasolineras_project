"""
Schemas Pydantic para la API de recomendación de gasolineras.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, model_validator
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
    origen: Coordenada = Field(..., description="Punto de partida")
    destino: Coordenada = Field(..., description="Punto de llegada")
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
    top_n: int = Field(5, ge=1, le=20, description="Número de recomendaciones a devolver")
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

    @property
    def tiene_precio(self) -> bool:
        return self.precio is not None and self.precio > 0


# ─────────────────────────────────────────────────────────────────────────────
# Response
# ─────────────────────────────────────────────────────────────────────────────
class RutaBase(BaseModel):
    distancia_km: float = Field(..., description="Distancia total de la ruta A→B en km")
    duracion_min: float = Field(..., description="Duración estimada de la ruta en minutos")
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


class EstadisticasRuta(BaseModel):
    candidatos_evaluados: int
    precio_medio: float
    precio_min: float
    precio_max: float
    combustible: str


class RecomendacionResponse(BaseModel):
    ruta_base: RutaBase
    estadisticas: EstadisticasRuta
    recomendaciones: List[RecomendacionItem]
    metadata: dict = Field(
        default_factory=dict,
        description="Información sobre el backend de routing usado y timestamps",
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
