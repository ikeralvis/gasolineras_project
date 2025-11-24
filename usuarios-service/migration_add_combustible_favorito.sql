-- Migración: Agregar campo combustible_favorito a la tabla users
-- Fecha: 2025-11-24
-- Descripción: Añade la columna combustible_favorito con valor por defecto 'Precio Gasolina 95 E5'

-- Verificar si la columna ya existe antes de añadirla
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'combustible_favorito'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN combustible_favorito VARCHAR(50) DEFAULT 'Precio Gasolina 95 E5';
        
        RAISE NOTICE 'Columna combustible_favorito añadida exitosamente';
    ELSE
        RAISE NOTICE 'La columna combustible_favorito ya existe';
    END IF;
END $$;

-- Actualizar usuarios existentes que tengan NULL
UPDATE users 
SET combustible_favorito = 'Precio Gasolina 95 E5' 
WHERE combustible_favorito IS NULL;
