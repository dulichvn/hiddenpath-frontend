// ═══════════════════════════════════════════════════════════
//  migrate.js — Tạo tất cả bảng trong PostgreSQL
//  Chạy 1 lần: node migrate.js
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🔄 Bắt đầu tạo database schema...\n');

    await client.query('BEGIN');

    // ── Bảng LEADS (khách hàng gửi yêu cầu) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name     VARCHAR(200)  NOT NULL,
        email         VARCHAR(320)  NOT NULL,
        whatsapp      VARCHAR(30),
        destination   VARCHAR(200),
        duration      VARCHAR(50),
        budget        VARCHAR(50),
        notes         TEXT,
        status        VARCHAR(20)   DEFAULT 'new'
                      CHECK (status IN ('new','contacted','quoted','booked','closed')),
        ip_address    INET,
        user_agent    TEXT,
        created_at    TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    console.log('  ✅ Bảng "leads" đã tạo');

    // ── Bảng JOURNEYS (dữ liệu tour) ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS journeys (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        slug          VARCHAR(120)  UNIQUE NOT NULL,
        title         VARCHAR(200)  NOT NULL,
        badge         VARCHAR(50),
        destination   VARCHAR(100)  NOT NULL,
        region        VARCHAR(100)  NOT NULL,
        accommodation VARCHAR(100),
        duration_days INTEGER       NOT NULL CHECK (duration_days > 0),
        price_usd     DECIMAL(10,2) NOT NULL CHECK (price_usd > 0),
        description   TEXT          NOT NULL,
        hero_image    VARCHAR(500),
        is_published  BOOLEAN       DEFAULT false,
        is_featured   BOOLEAN       DEFAULT false,
        sort_order    INTEGER       DEFAULT 0,
        created_at    TIMESTAMPTZ   DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    console.log('  ✅ Bảng "journeys" đã tạo');

    // ── Indexes để tăng tốc truy vấn ─────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_email
        ON leads(email);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_created
        ON leads(created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_status
        ON leads(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_journeys_slug
        ON journeys(slug);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_journeys_published
        ON journeys(is_published) WHERE is_published = true;
    `);
    console.log('  ✅ Indexes đã tạo');

    // ── Migrate dữ liệu cũ từ leads.json (nếu có) ────────────
    const fs = require('fs');
    const path = require('path');
    const leadsFile = path.join(__dirname, 'leads.json');

    if (fs.existsSync(leadsFile)) {
      const oldLeads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));

      if (oldLeads.length > 0) {
        console.log(`\n  🔄 Đang migrate ${oldLeads.length} leads cũ từ leads.json...`);

        for (const lead of oldLeads) {
          await client.query(`
            INSERT INTO leads
              (full_name, email, whatsapp, destination, duration, budget, notes, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
          `, [
            lead.full_name,
            lead.email,
            lead.whatsapp || null,
            lead.destination || null,
            lead.duration || null,
            lead.budget || null,
            lead.notes || null,
            lead.created_at ? new Date(lead.created_at) : new Date()
          ]);
        }

        // Backup leads.json cũ
        fs.renameSync(leadsFile, leadsFile + '.backup');
        console.log(`  ✅ Đã migrate ${oldLeads.length} leads → PostgreSQL`);
        console.log('  📁 leads.json cũ → leads.json.backup');
      }
    }

    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════');
    console.log('  🎉  Migration hoàn tất thành công!');
    console.log('══════════════════════════════════════════\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration thất bại:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
