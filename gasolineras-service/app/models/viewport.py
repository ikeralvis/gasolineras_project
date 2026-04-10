"""Modelos de entrada para endpoints geograficos."""
from pydantic import BaseModel, Field


class MarkersViewport(BaseModel):
    lat_ne: float = Field(..., ge=-90, le=90)
    lon_ne: float = Field(..., ge=-180, le=180)
    lat_sw: float = Field(..., ge=-90, le=90)
    lon_sw: float = Field(..., ge=-180, le=180)
    zoom: int = Field(..., ge=0, le=22)
