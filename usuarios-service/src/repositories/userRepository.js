export class UserRepository {
  constructor(pg) {
    this.pg = pg;
  }

  async create({ nombre, email, passwordHash, modeloCoche, tipoCombustibleCoche, combustibleFavorito }) {
    const query = `
      INSERT INTO users (nombre, email, password_hash, modelo_coche, tipo_combustible_coche, combustible_favorito)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, nombre, email, modelo_coche, tipo_combustible_coche, combustible_favorito;
    `;
    const result = await this.pg.query(query, [
      nombre,
      email,
      passwordHash,
      modeloCoche,
      tipoCombustibleCoche,
      combustibleFavorito,
    ]);
    return result.rows[0] || null;
  }

  async findByEmail(email) {
    const result = await this.pg.query(
      'SELECT id, nombre, email, password_hash, is_admin, google_id FROM users WHERE email = $1;',
      [email]
    );
    return result.rows[0] || null;
  }

  async findById(id) {
    const result = await this.pg.query(
      'SELECT id, nombre, email, is_admin, combustible_favorito, modelo_coche, tipo_combustible_coche FROM users WHERE id = $1;',
      [id]
    );
    return result.rows[0] || null;
  }

  async emailInUseByOtherUser(email, userId) {
    const result = await this.pg.query('SELECT id FROM users WHERE email = $1 AND id != $2;', [email, userId]);
    return result.rows.length > 0;
  }

  async updateById(userId, updates) {
    const COLUMNS = {
      NAME: 'nombre',
      EMAIL: 'email',
      PASSWORD_HASH: 'password_hash',
      FUEL_PREFERENCE: 'combustible_favorito',
      CAR_MODEL: 'modelo_coche',
      CAR_FUEL_TYPE: 'tipo_combustible_coche',
    };

    const allowed = {
      nombre: COLUMNS.NAME,
      email: COLUMNS.EMAIL,
      password_hash: COLUMNS.PASSWORD_HASH,
      combustible_favorito: COLUMNS.FUEL_PREFERENCE,
      modelo_coche: COLUMNS.CAR_MODEL,
      tipo_combustible_coche: COLUMNS.CAR_FUEL_TYPE,
    };

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (!(key in allowed)) continue;
      setClauses.push(`${allowed[key]} = $${idx++}`);
      values.push(value);
    }

    if (setClauses.length === 0) {
      return null;
    }

    values.push(userId);
    const query = `
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING id, nombre, email, combustible_favorito, modelo_coche, tipo_combustible_coche;
    `;

    const result = await this.pg.query(query, values);
    return result.rows[0] || null;
  }

  async deleteById(userId) {
    const result = await this.pg.query('DELETE FROM users WHERE id = $1 RETURNING id;', [userId]);
    return result.rowCount > 0;
  }

  async listUsers() {
    const result = await this.pg.query('SELECT id, nombre, email, is_admin FROM users ORDER BY id ASC;');
    return result.rows;
  }

  async setGoogleId(userId, googleId) {
    await this.pg.query('UPDATE users SET google_id = $1 WHERE id = $2;', [googleId, userId]);
  }

  async createGoogleUser({ nombre, email, passwordHash, googleId }) {
    const query = `
      INSERT INTO users (nombre, email, password_hash, google_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nombre, email, is_admin;
    `;
    const result = await this.pg.query(query, [nombre, email, passwordHash, googleId]);
    return result.rows[0] || null;
  }
}
