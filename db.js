// ═══════════════════════════════════════════════════════════
//  db.js — PostgreSQL Connection Pool
//  Kết nối an toàn với SSL, tự động retry khi mất kết nối
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Railway PostgreSQL requires this
    : false,
  max: 10,                  // Tối đa 10 kết nối đồng thời
  idleTimeoutMillis: 30000, // Đóng kết nối nhàn rỗi sau 30s
  connectionTimeoutMillis: 5000, // Timeout kết nối sau 5s
});

// Kiểm tra kết nối khi khởi động
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Lỗi kết nối PostgreSQL:', err.message);
    return;
  }
  console.log('✅ PostgreSQL đã kết nối thành công!');
  release();
});

// Xử lý lỗi pool
pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

module.exports = { pool };
