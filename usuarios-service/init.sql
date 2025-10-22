-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Favoritos (Relación muchos a muchos implícita con ideess de gasolinera)
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ideess VARCHAR(10) NOT NULL, -- ID de Estación de Servicio, como se define en la API pública
    PRIMARY KEY (user_id, ideess),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Usuario administrador de ejemplo (si se desea poblar)
-- INSERT INTO users (nombre, email, password_hash, is_admin)
-- VALUES ('Admin User', 'admin@example.com', '<HASH_BCRYPT_DE_UNA_PASSWORD>', TRUE);