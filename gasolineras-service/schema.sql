-- ============================================================
-- Esquema PostgreSQL para el servicio de Gasolineras
-- Ejecutar en Neon Console (SQL Editor) o cualquier PostgreSQL
-- ============================================================

-- PostGIS: extensión para consultas geoespaciales (disponible en Neon)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- Tabla principal de gasolineras
-- ============================================================
CREATE TABLE IF NOT EXISTS gasolineras (
    ideess                  VARCHAR(10)         PRIMARY KEY,
    rotulo                  VARCHAR(255),
    municipio               VARCHAR(255),
    provincia               VARCHAR(255),
    direccion               TEXT,
    precio_95_e5            NUMERIC(6,3),
    precio_98_e5            NUMERIC(6,3),
    precio_gasoleo_a        NUMERIC(6,3),
    precio_gasoleo_b        NUMERIC(6,3),
    precio_gasoleo_premium  NUMERIC(6,3),
    latitud                 DOUBLE PRECISION,
    longitud                DOUBLE PRECISION,
    -- Columna geográfica PostGIS (EPSG:4326 = WGS84)
    geom                    GEOGRAPHY(POINT, 4326),
    -- Horario en texto original y en JSONB estructurado
    horario                 TEXT,
    horario_parsed          JSONB,
    actualizado_en          TIMESTAMPTZ         DEFAULT NOW()
);

-- Índices para filtros de texto
CREATE INDEX IF NOT EXISTS idx_gasolineras_provincia ON gasolineras (provincia);
CREATE INDEX IF NOT EXISTS idx_gasolineras_municipio ON gasolineras (municipio);

-- Índice espacial GIST para búsquedas por proximidad (mucho más rápido que Haversine)
CREATE INDEX IF NOT EXISTS idx_gasolineras_geom ON gasolineras USING GIST(geom);

-- ============================================================
-- Si ya tienes la tabla creada (migración), ejecuta esto:
-- ============================================================
-- ALTER TABLE gasolineras ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(POINT, 4326);
-- ALTER TABLE gasolineras ADD COLUMN IF NOT EXISTS horario TEXT;
-- ALTER TABLE gasolineras ADD COLUMN IF NOT EXISTS horario_parsed JSONB;
-- UPDATE gasolineras
--   SET geom = ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography
--   WHERE longitud IS NOT NULL AND latitud IS NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_gasolineras_geom ON gasolineras USING GIST(geom);

-- ============================================================
-- Tabla de precios históricos
-- Solo se guardan snapshots de las gasolineras favoritas.
-- ============================================================
CREATE TABLE IF NOT EXISTS precios_historicos (
    id      SERIAL      PRIMARY KEY,
    ideess  VARCHAR(10) NOT NULL,
    fecha   DATE        NOT NULL,
    p95     NUMERIC(6,3),
    p98     NUMERIC(6,3),
    pa      NUMERIC(6,3),
    pb      NUMERIC(6,3),
    pp      NUMERIC(6,3),
    UNIQUE (ideess, fecha)  -- evita duplicados del mismo día
);

CREATE INDEX IF NOT EXISTS idx_historico_ideess_fecha
    ON precios_historicos (ideess, fecha DESC);

-- ============================================================
-- Limpieza de histórico > 30 días (ejecutar manualmente o
-- programar con pg_cron en Neon)
-- ============================================================
-- DELETE FROM precios_historicos WHERE fecha < NOW() - INTERVAL '30 days';
