import type { Env } from '../index';

export const dbService = {
  async getOpportunities(
    db: D1Database,
    params: {
      chainId?: number;
      from?: number;
      to?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    let query = 'SELECT * FROM opportunities WHERE 1=1';
    const bindings: any[] = [];
    
    if (params.chainId !== undefined) {
      query += ' AND chain_id = ?';
      bindings.push(params.chainId);
    }
    
    if (params.from !== undefined) {
      query += ' AND ts >= ?';
      bindings.push(params.from);
    }
    
    if (params.to !== undefined) {
      query += ' AND ts <= ?';
      bindings.push(params.to);
    }
    
    query += ' ORDER BY ts DESC';
    
    if (params.limit !== undefined) {
      query += ' LIMIT ?';
      bindings.push(params.limit);
    }
    
    if (params.offset !== undefined) {
      query += ' OFFSET ?';
      bindings.push(params.offset);
    }
    
    const result = await db.prepare(query).bind(...bindings).all();
    return result.results || [];
  },
  
  async createOpportunity(db: D1Database, opportunity: any): Promise<void> {
    const query = `
      INSERT INTO opportunities (
        id, chain_id, dex_in, dex_out, base_token, quote_token,
        amount_in, est_profit_usd, gas_usd, ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await db.prepare(query).bind(
      opportunity.id,
      opportunity.chainId,
      opportunity.dexIn,
      opportunity.dexOut,
      opportunity.baseToken,
      opportunity.quoteToken,
      opportunity.amountIn,
      opportunity.estProfitUsd,
      opportunity.gasUsd,
      opportunity.ts || Date.now()
    ).run();
  },
  
  async getAssetSafety(
    db: D1Database,
    addresses?: string[]
  ): Promise<any[]> {
    if (!addresses || addresses.length === 0) {
      const result = await db.prepare(
        'SELECT * FROM asset_safety ORDER BY updated_at DESC LIMIT 1000'
      ).all();
      return result.results || [];
    }
    
    const placeholders = addresses.map(() => '?').join(',');
    const query = `SELECT * FROM asset_safety WHERE address IN (${placeholders})`;
    
    const result = await db.prepare(query).bind(...addresses).all();
    return result.results || [];
  },
  
  async upsertAssetSafety(db: D1Database, assets: any[]): Promise<void> {
    for (const asset of assets) {
      await db.prepare(`
        INSERT INTO asset_safety (address, score, checks, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          score = excluded.score,
          checks = excluded.checks,
          updated_at = excluded.updated_at
      `).bind(
        asset.address,
        asset.score,
        JSON.stringify(asset.checks),
        asset.updatedAt || Date.now()
      ).run();
    }
  },
  
  async updateAssetSafety(db: D1Database, address: string, updates: any): Promise<void> {
    await db.prepare(`
      UPDATE asset_safety
      SET score = ?, checks = ?, updated_at = ?
      WHERE address = ?
    `).bind(
      updates.score,
      JSON.stringify(updates.checks),
      updates.updatedAt || Date.now(),
      address
    ).run();
  },
  
  async getExecutions(
    db: D1Database,
    params: {
      chainId?: number;
      status?: string;
      from?: number;
      to?: number;
      limit?: number;
      offset?: number;
      sortBy?: string;
      order?: string;
    } = {}
  ): Promise<any[]> {
    let query = 'SELECT * FROM executions WHERE 1=1';
    const bindings: any[] = [];
    
    if (params.chainId !== undefined) {
      query += ' AND chain_id = ?';
      bindings.push(params.chainId);
    }
    
    if (params.status) {
      query += ' AND status = ?';
      bindings.push(params.status);
    }
    
    if (params.from !== undefined) {
      query += ' AND created_at >= ?';
      bindings.push(params.from);
    }
    
    if (params.to !== undefined) {
      query += ' AND created_at <= ?';
      bindings.push(params.to);
    }
    
    const sortColumn = params.sortBy || 'created_at';
    const sortOrder = params.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    
    if (params.limit !== undefined) {
      query += ' LIMIT ?';
      bindings.push(params.limit);
    }
    
    if (params.offset !== undefined) {
      query += ' OFFSET ?';
      bindings.push(params.offset);
    }
    
    const result = await db.prepare(query).bind(...bindings).all();
    return result.results || [];
  },
  
  async getExecution(db: D1Database, id: string): Promise<any> {
    const result = await db.prepare(
      'SELECT * FROM executions WHERE id = ?'
    ).bind(id).first();
    
    return result;
  },
  
  async createExecution(db: D1Database, execution: any): Promise<void> {
    const query = `
      INSERT INTO executions (
        id, status, tx_hash, chain_id, profit_usd, gas_usd,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await db.prepare(query).bind(
      execution.id,
      execution.status,
      execution.txHash || null,
      execution.chainId,
      execution.profitUsd || null,
      execution.gasUsd || null,
      execution.createdAt || Date.now(),
      execution.updatedAt || Date.now()
    ).run();
  },
  
  async updateExecution(db: D1Database, id: string, updates: any): Promise<void> {
    const fields = [];
    const values = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    
    if (updates.txHash !== undefined) {
      fields.push('tx_hash = ?');
      values.push(updates.txHash);
    }
    
    if (updates.profitUsd !== undefined) {
      fields.push('profit_usd = ?');
      values.push(updates.profitUsd);
    }
    
    if (updates.gasUsd !== undefined) {
      fields.push('gas_usd = ?');
      values.push(updates.gasUsd);
    }
    
    fields.push('updated_at = ?');
    values.push(updates.updatedAt || Date.now());
    
    values.push(id);
    
    const query = `UPDATE executions SET ${fields.join(', ')} WHERE id = ?`;
    await db.prepare(query).bind(...values).run();
  },
  
  async getActiveConfig(db: D1Database): Promise<any> {
    const result = await db.prepare(
      'SELECT * FROM engine_config WHERE is_active = true ORDER BY updated_at DESC LIMIT 1'
    ).first();
    
    return result?.config;
  },
  
  async getConfigHistory(db: D1Database, limit: number = 10): Promise<any[]> {
    const result = await db.prepare(
      'SELECT * FROM engine_config ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();
    
    return result.results || [];
  },
  
  async getConfigByVersion(db: D1Database, version: string): Promise<any> {
    const result = await db.prepare(
      'SELECT * FROM engine_config WHERE version = ?'
    ).bind(version).first();
    
    return result;
  },
  
  async createConfig(db: D1Database, config: any): Promise<any> {
    const query = `
      INSERT INTO engine_config (version, config, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `;
    
    const result = await db.prepare(query).bind(
      config.version,
      JSON.stringify(config.config),
      config.isActive,
      config.createdAt || Date.now(),
      config.updatedAt || Date.now()
    ).first();
    
    return result;
  },
  
  async updateConfig(db: D1Database, id: number, updates: any): Promise<void> {
    const fields = [];
    const values = [];
    
    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.isActive);
    }
    
    if (updates.config !== undefined) {
      fields.push('config = ?');
      values.push(JSON.stringify(updates.config));
    }
    
    fields.push('updated_at = ?');
    values.push(updates.updatedAt || Date.now());
    
    values.push(id);
    
    const query = `UPDATE engine_config SET ${fields.join(', ')} WHERE id = ?`;
    await db.prepare(query).bind(...values).run();
  },
  
  async deactivateConfigs(db: D1Database): Promise<void> {
    await db.prepare(
      'UPDATE engine_config SET is_active = false WHERE is_active = true'
    ).run();
  },
  
  async runMigration(db: D1Database, sql: string): Promise<void> {
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  },
};