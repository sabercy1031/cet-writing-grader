const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : false
});

// 初始化用户表
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      free_score_left INTEGER NOT NULL DEFAULT 3,
      last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[DB] 用户表初始化完成");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS score_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      essay_text TEXT NOT NULL,
      result_text TEXT NOT NULL,
      score_value VARCHAR(20),
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[DB] 历史记录表初始化完成");
}

module.exports = { pool, initDB };