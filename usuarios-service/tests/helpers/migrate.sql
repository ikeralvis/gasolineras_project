-- Schema mínimo para los tests de integración de usuarios-service.
-- Ejecutado por el workflow de CI contra la instancia postgres:15 del servicio.

CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  nombre                VARCHAR(255) NOT NULL DEFAULT '',
  email                 VARCHAR(255) UNIQUE NOT NULL,
  password_hash         VARCHAR(255) NOT NULL DEFAULT '',
  is_admin              BOOLEAN NOT NULL DEFAULT FALSE,
  google_id             VARCHAR(255),
  modelo_coche          VARCHAR(255),
  tipo_combustible_coche VARCHAR(50),
  combustible_favorito  VARCHAR(100),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ideess     VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ideess)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
