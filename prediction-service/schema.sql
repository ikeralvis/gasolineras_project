-- Tabla de serving para predicciones en Neon/PostgreSQL
-- Ejecutar en el mismo DATABASE_URL compartido por la plataforma.

CREATE TABLE IF NOT EXISTS prediction_forecasts (
    ideess VARCHAR(10) NOT NULL,
    fuel VARCHAR(64) NOT NULL,
    forecast_date DATE NOT NULL,
    run_date DATE NOT NULL,
    precio_predicho NUMERIC(8,3) NOT NULL,
    margen_min NUMERIC(8,3),
    margen_max NUMERIC(8,3),
    favorites_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ideess, fuel, forecast_date, run_date)
);

CREATE INDEX IF NOT EXISTS idx_prediction_forecasts_ideess_run
    ON prediction_forecasts (ideess, run_date DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_forecasts_run
    ON prediction_forecasts (run_date DESC);
