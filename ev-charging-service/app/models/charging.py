"""
Pydantic schemas for the mapareve.es external API and internal DB.

Real /markers response format:
  Cluster:  { latitude, longitude, type: "cluster", total_evse }
  Location: { latitude, longitude, type: "location", total_evse,
              location: { id, name, latitude, longitude, status, total_evse, source_type } }
"""
from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel


# ── Request ──────────────────────────────────────────────────────────────────

class BoundingBoxRequest(BaseModel):
    lat_ne: float
    lon_ne: float
    lat_sw: float
    lon_sw: float
    zoom: int


# ── External API response fragments ──────────────────────────────────────────

class LocationInMarker(BaseModel):
    """Nested 'location' object present only on type=location markers."""
    id: str                             # UUID string from external API
    name: str
    latitude: float
    longitude: float
    status: Optional[str] = None        # AVAILABLE, CHARGING, UNKNOWN, …
    total_evse: int
    source_type: Optional[str] = None   # OCPI, …


class ClusterMarker(BaseModel):
    """Cluster marker — all fields are at the top level (no nested object)."""
    type: Literal["cluster"]
    latitude: float
    longitude: float
    total_evse: int


class LocationMarker(BaseModel):
    """Individual location marker with a nested 'location' sub-object."""
    type: Literal["location"]
    latitude: float
    longitude: float
    total_evse: int
    location: LocationInMarker
