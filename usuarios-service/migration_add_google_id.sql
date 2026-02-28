-- Migración: Agregar campo google_id a la tabla users para OAuth
-- Fecha: 2025-11-25
-- Descripción: Añade la columna google_id para almacenar el ID de Google de usuarios OAuth

-- Verificar si la columna ya existe antes de añadirla
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'google_id'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN google_id VARCHAR(255) UNIQUE;
        
        RAISE NOTICE 'Columna google_id añadida exitosamente';
    ELSE
        RAISE NOTICE 'La columna google_id ya existe';
    END IF;
END $$;

-- Crear índice para búsquedas rápidas por google_id
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
