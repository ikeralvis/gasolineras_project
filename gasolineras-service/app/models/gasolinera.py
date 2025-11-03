"""
Modelos Pydantic para Gasolineras
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional

class Gasolinera(BaseModel):
    """
    Modelo de datos para una estación de servicio
    
    Representa una gasolinera con su información básica,
    ubicación geográfica y precios de combustibles.
    """
    
    IDEESS: Optional[str] = Field(
        None,
        description="Identificador único de la estación de servicio",
        examples=["12345"]
    )
    
    Rótulo: Optional[str] = Field(
        None,
        description="Nombre comercial de la gasolinera",
        examples=["REPSOL", "CEPSA", "BP"]
    )
    
    Municipio: Optional[str] = Field(
        None,
        description="Municipio donde se ubica la gasolinera",
        examples=["MADRID", "BARCELONA"]
    )
    
    Provincia: Optional[str] = Field(
        None,
        description="Provincia donde se ubica la gasolinera",
        examples=["MADRID", "BARCELONA"]
    )
    
    Dirección: Optional[str] = Field(
        None,
        alias="Dirección",
        description="Dirección postal completa",
        examples=["CALLE MAYOR 123"]
    )
    
    precio_gasolina_95_e5: Optional[str] = Field(
        None,
        alias="Precio Gasolina 95 E5",
        description="Precio de la gasolina 95 E5 en euros/litro",
        examples=["1.459", "1.529"]
    )
    
    precio_gasoleo_a: Optional[str] = Field(
        None,
        alias="Precio Gasoleo A",
        description="Precio del gasóleo A en euros/litro",
        examples=["1.329", "1.399"]
    )
    
    Latitud: Optional[float] = Field(
        None,
        description="Latitud geográfica (WGS84)",
        examples=[40.4168, 41.3851],
        ge=-90,
        le=90
    )
    
    Longitud: Optional[float] = Field(
        None,
        description="Longitud geográfica (WGS84)",
        examples=[-3.7038, 2.1734],
        ge=-180,
        le=180
    )
    
    @field_validator('Latitud', 'Longitud', mode='before')
    @classmethod
    def validate_coordinates(cls, v):
        """Valida que las coordenadas sean números válidos"""
        if v is None or v == "":
            return None
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v.replace(",", "."))
            except ValueError:
                return None
        return None
    
    class Config:
        """Configuración del modelo"""
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "IDEESS": "12345",
                "Rótulo": "REPSOL",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Dirección": "CALLE MAYOR 123",
                "Precio Gasolina 95 E5": "1.459",
                "Precio Gasoleo A": "1.329",
                "Latitud": 40.4168,
                "Longitud": -3.7038
            }
        }
