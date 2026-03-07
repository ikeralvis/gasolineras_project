-- EV Charging Points table
-- Run this once against your PostgreSQL / Neon database

CREATE TABLE IF NOT EXISTS charging_points (
    id               UUID PRIMARY KEY,   -- UUID from mapareve.es
    name             TEXT NOT NULL,
    address          TEXT,
    postal_code      TEXT,
    country          TEXT DEFAULT 'ESP',
    latitude         DOUBLE PRECISION NOT NULL,
    longitude        DOUBLE PRECISION NOT NULL,
    operator_name    TEXT,
    operator_website TEXT,
    operator_phone   TEXT,
    is_24_7          BOOLEAN DEFAULT TRUE,
    raw_detail       JSONB,              -- Full evses, connectors and tariffs
    last_sync        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charging_points_coords
    ON charging_points (latitude, longitude);
