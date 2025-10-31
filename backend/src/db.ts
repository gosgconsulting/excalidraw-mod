import path from "path";

import { Pool } from "pg";
import dotenv from "dotenv";

import type { PoolClient, QueryResultRow } from "pg";

// Ensure .env is loaded (in case db.ts is imported before server.ts loads it)
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// Use DATABASE_URL if provided, otherwise fall back to individual parameters
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "excalidraw",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

// Debug logging (can be removed in production)
if (process.env.DATABASE_URL) {
  console.log("[testing] Using DATABASE_URL for database connection");
} else {
  console.log(
    "[testing] Using individual DB parameters for database connection",
  );
  console.log("[testing] DB_HOST:", process.env.DB_HOST || "localhost");
}

const pool = new Pool(poolConfig);

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<T[]> => {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log("[testing] Executed query", {
      text: text.substring(0, 50),
      duration,
      rows: res.rowCount,
    });
    return res.rows;
  } catch (error) {
    console.error("[testing] Database query error", error);
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  return await pool.connect();
};

export const initDatabase = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS drawings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(255) UNIQUE NOT NULL,
        encrypted_data BYTEA NOT NULL,
        encryption_key VARCHAR(255) NOT NULL,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_accessed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_drawings_slug ON drawings(slug);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_drawings_updated_at ON drawings(updated_at);
    `);

    console.log("[testing] Database initialized successfully");
  } catch (error) {
    console.error("[testing] Database initialization error", error);
    throw error;
  }
};

export const closePool = async () => {
  await pool.end();
};
