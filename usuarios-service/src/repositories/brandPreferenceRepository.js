export class BrandPreferenceRepository {
  constructor(pg) {
    this.pg = pg;
  }

  async upsert(userId, marca, esSocio) {
    const query = `
      INSERT INTO user_brand_preferences (user_id, marca, es_socio)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, marca) DO UPDATE SET es_socio = EXCLUDED.es_socio
      RETURNING marca, es_socio, created_at;
    `;
    const result = await this.pg.query(query, [userId, marca, esSocio]);
    return result.rows[0];
  }

  async listByUser(userId) {
    const result = await this.pg.query(
      'SELECT marca, es_socio, created_at FROM user_brand_preferences WHERE user_id = $1 ORDER BY created_at ASC;',
      [userId]
    );
    return result.rows;
  }

  async delete(userId, marca) {
    const result = await this.pg.query(
      'DELETE FROM user_brand_preferences WHERE user_id = $1 AND marca = $2 RETURNING marca;',
      [userId, marca]
    );
    return result.rowCount > 0;
  }
}
