export class FavoriteRepository {
  constructor(pg) {
    this.pg = pg;
  }

  async add(userId, ideess) {
    const query = `
      INSERT INTO user_favorites (user_id, ideess)
      VALUES ($1, $2)
      ON CONFLICT (user_id, ideess) DO NOTHING
      RETURNING ideess;
    `;
    const result = await this.pg.query(query, [userId, ideess]);
    return {
      inserted: result.rowCount > 0,
      ideess: result.rows[0]?.ideess || ideess,
    };
  }

  async listByUser(userId) {
    const result = await this.pg.query(
      'SELECT ideess, created_at FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC;',
      [userId]
    );
    return result.rows;
  }

  async delete(userId, ideess) {
    const result = await this.pg.query('DELETE FROM user_favorites WHERE user_id = $1 AND ideess = $2 RETURNING ideess;', [
      userId,
      ideess,
    ]);
    return result.rowCount > 0;
  }

  async deleteMany(userId, ideessList) {
    if (!Array.isArray(ideessList) || ideessList.length === 0) return 0;
    const result = await this.pg.query('DELETE FROM user_favorites WHERE user_id = $1 AND ideess = ANY($2::varchar[]);', [
      userId,
      ideessList,
    ]);
    return result.rowCount;
  }

  async listDistinctIdeess() {
    const result = await this.pg.query('SELECT DISTINCT ideess FROM user_favorites ORDER BY ideess ASC;');
    return result.rows.map((row) => row.ideess);
  }

  async getStats(topN, minFavorites) {
    const query = `
      SELECT ideess, COUNT(*)::int AS favorites_count
      FROM user_favorites
      GROUP BY ideess
      HAVING COUNT(*) >= $1
      ORDER BY favorites_count DESC, ideess ASC
      LIMIT $2;
    `;
    const result = await this.pg.query(query, [minFavorites, topN]);
    return result.rows.map((row) => ({
      ideess: row.ideess,
      favorites_count: Number(row.favorites_count),
    }));
  }
}
