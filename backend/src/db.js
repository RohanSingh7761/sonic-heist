import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/sonicheist',
});

// Initialize database schema on startup
export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        wallet_address VARCHAR(42) NOT NULL,
        private_key VARCHAR(66) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS thefts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS saves INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0;
    `);
    console.log('PostgreSQL database connected and initialized successfully');
  } finally {
    client.release();
  }
}
