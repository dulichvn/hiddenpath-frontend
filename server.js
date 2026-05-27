// ═══════════════════════════════════════════════════════════
//  Vietnam Haute Voyage — Backend Server
//  Stack: Node.js + Express + PostgreSQL + Nodemailer + Google Sheets
// ═══════════════════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const { pool }   = require('./db');   // ← PostgreSQL thay JSON

// ── 1. KHỞI TẠO ──────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── 2. MIDDLEWARE ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ── 3. CẤU HÌNH GMAIL ────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  }
});

transporter.verify((error) => {
  if (error) {
    console.log('⚠️  Gmail chưa kết nối:', error.message);
  } else {
    console.log('✅ Gmail đã kết nối thành công!');
  }
});

// ── 4. CẤU HÌNH GOOGLE SHEETS ────────────────────────────
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let sheetsClient = null;

async function initGoogleSheets() {
  try {
    let credentials;
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else {
      const credFile = path.join(__dirname, process.env.GOOGLE_CREDENTIALS_FILE || 'credentials.json');
      credentials = JSON.parse(fs.readFileSync(credFile, 'utf8'));
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });

    // Tạo tiêu đề nếu sheet còn trống
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:I1',
    });

    if (!res.data.values || res.data.values.length === 0) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['ID', 'Họ và tên', 'Email', 'WhatsApp',
            'Điểm đến', 'Thời gian', 'Ngân sách', 'Ghi chú', 'Ngày nhận']]
        }
      });
    }
    console.log('✅ Google Sheets đã kết nối thành công!');
  } catch (err) {
    console.log('⚠️  Google Sheets chưa kết nối:', err.message);
    sheetsClient = null;
  }
}

async function appendToSheet(lead) {
  if (!sheetsClient) return;
  try {
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          lead.id, lead.full_name, lead.email,
          lead.whatsapp || '', lead.destination || '',
          lead.duration || '', lead.budget || '',
          lead.notes || '', lead.created_at
        ]]
      }
    });
  } catch (err) {
    console.log('⚠️  Sheets error:', err.message);
  }
}

// ── 5. HÀM GỬI EMAIL ─────────────────────────────────────
async function sendOwnerNotification(lead) {
  const mailOptions = {
    from:    `"${process.env.COMPANY_NAME}" <${process.env.GMAIL_USER}>`,
    to:      process.env.NOTIFY_EMAIL,
    subject: `🌟 Yêu cầu tư vấn mới — ${lead.full_name}`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Georgia,serif;background:#f5f0e8;margin:0;padding:20px}
.c{max-width:580px;margin:0 auto;background:#0f0f0f;border-top:3px solid #C6A24A}
.h{padding:28px 32px 20px;border-bottom:1px solid #222}
.b{padding:28px 32px}
.logo{color:#C6A24A;font-size:20px;margin:0}
.badge{background:#C6A24A;color:#000;font-size:10px;letter-spacing:3px;text-transform:uppercase;padding:3px 10px;font-weight:bold;display:inline-block;margin-top:8px}
table{width:100%;border-collapse:collapse;margin-top:16px}
td{padding:10px 12px;border-bottom:1px solid #222;font-size:14px}
.lbl{color:#C6A24A;font-size:10px;letter-spacing:2px;text-transform:uppercase;width:120px}
.val{color:#FAF7F2}
.btn{display:inline-block;background:#C6A24A;color:#000;padding:12px 24px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-top:20px}
.f{padding:16px 32px;background:#070707;color:rgba(255,255,255,0.25);font-size:11px;text-align:center}
</style></head><body>
<div class="c">
  <div class="h">
    <p class="logo">Vietnam Haute Voyage</p>
    <span class="badge">Yêu cầu tư vấn mới</span>
  </div>
  <div class="b">
    <table>
      <tr><td class="lbl">Họ và tên</td><td class="val">${lead.full_name}</td></tr>
      <tr><td class="lbl">Email</td><td class="val">${lead.email}</td></tr>
      <tr><td class="lbl">WhatsApp</td><td class="val">${lead.whatsapp || '—'}</td></tr>
      <tr><td class="lbl">Điểm đến</td><td class="val">${lead.destination || '—'}</td></tr>
      <tr><td class="lbl">Thời gian</td><td class="val">${lead.duration || '—'}</td></tr>
      <tr><td class="lbl">Ngân sách</td><td class="val">${lead.budget || '—'}</td></tr>
      ${lead.notes ? `<tr><td class="lbl">Ghi chú</td><td class="val">${lead.notes}</td></tr>` : ''}
      <tr><td class="lbl">Ngày nhận</td><td class="val">${lead.created_at}</td></tr>
    </table>
    <a href="mailto:${lead.email}" class="btn">Liên hệ khách ngay →</a>
    ${lead.whatsapp ? `<br><a href="https://wa.me/${lead.whatsapp.replace(/\D/g,'')}" style="color:#C6A24A;font-size:12px;margin-top:8px;display:inline-block">💬 Nhắn WhatsApp</a>` : ''}
  </div>
  <div class="f">${process.env.COMPANY_NAME} · Bespoke Luxury Journeys Since 2009</div>
</div></body></html>`
  };
  await transporter.sendMail(mailOptions);
  console.log(`   📧 Email thông báo → ${process.env.NOTIFY_EMAIL}`);
}

async function sendGuestConfirmation(lead) {
  const firstName = lead.full_name.trim().split(' ').pop();
  const mailOptions = {
    from:    `"${process.env.COMPANY_NAME}" <${process.env.GMAIL_USER}>`,
    to:      lead.email,
    subject: `Chúng tôi đã nhận yêu cầu của bạn — ${process.env.COMPANY_NAME}`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Georgia,serif;background:#f5f0e8;margin:0;padding:20px}
.c{max-width:580px;margin:0 auto;background:#0f0f0f;border-top:3px solid #C6A24A}
.h{padding:36px 32px 24px;border-bottom:1px solid #222;text-align:center}
.logo{color:#F4EFE6;font-size:20px;margin:0;letter-spacing:2px}
.icon{font-size:36px;margin:16px 0 8px;display:block}
.b{padding:36px 32px;text-align:center}
.title{color:#FAF7F2;font-style:italic;font-weight:400;font-size:26px;margin:0 0 12px}
.sub{color:rgba(244,239,230,0.65);line-height:1.8;margin:0 0 24px}
.hl{color:#FAF7F2;font-weight:bold}
.box{background:rgba(198,162,74,0.1);border:1px solid rgba(198,162,74,0.3);padding:20px;margin:20px 0;text-align:left}
.box-lbl{color:#C6A24A;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px}
.box-val{color:#FAF7F2;margin:0 0 4px;font-size:15px}
.btn{display:inline-block;background:#25D366;color:#fff;padding:12px 24px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-top:16px}
.f{padding:16px 32px;background:#070707;color:rgba(255,255,255,0.25);font-size:11px;text-align:center}
</style></head><body>
<div class="c">
  <div class="h">
    <p class="logo">Vietnam Haute Voyage</p>
    <span class="icon">✦</span>
    <p style="color:#C6A24A;font-size:10px;letter-spacing:4px;text-transform:uppercase;margin:0">Bespoke Luxury Journeys</p>
  </div>
  <div class="b">
    <h1 class="title">Cảm ơn, ${firstName}!</h1>
    <p class="sub">Chúng tôi đã nhận được yêu cầu của bạn.<br>
    Chuyên gia sẽ liên hệ trong vòng <span class="hl">24 giờ</span>.</p>
    <div class="box">
      <p class="box-lbl">Yêu cầu của bạn</p>
      <p class="box-val">📍 ${lead.destination || 'Chưa chọn điểm đến'}</p>
      ${lead.duration ? `<p class="box-val">⏱ ${lead.duration}</p>` : ''}
      ${lead.budget ? `<p class="box-val">💰 ${lead.budget}</p>` : ''}
    </div>
    <a href="https://wa.me/84123456789" class="btn">💬 WhatsApp 24/7</a>
  </div>
  <div class="f">${process.env.COMPANY_NAME} · 18 Phan Chu Trinh, Hoàn Kiếm, Hanoi</div>
</div></body></html>`
  };
  await transporter.sendMail(mailOptions);
  console.log(`   📧 Email xác nhận → ${lead.email}`);
}

// ── 6. API: NHẬN YÊU CẦU TỪ FORM ────────────────────────
app.post('/api/leads', async (req, res) => {
  const {
    full_name, email,
    whatsapp='', destination='', duration='', budget='', notes=''
  } = req.body;

  // Validation
  if (!full_name || full_name.trim() === '')
    return res.status(400).json({ success: false, message: 'Vui lòng nhập họ và tên.' });
  if (!email || !email.includes('@'))
    return res.status(400).json({ success: false, message: 'Địa chỉ email không hợp lệ.' });

  try {
    // ── Lưu vào PostgreSQL với parameterised query ──────────
    const result = await pool.query(`
      INSERT INTO leads
        (full_name, email, whatsapp, destination, duration, budget, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [
      full_name.trim(),
      email.trim().toLowerCase(),
      whatsapp.trim() || null,
      destination.trim() || null,
      duration.trim() || null,
      budget.trim() || null,
      notes.trim() || null
    ]);

    const newLead = {
      id: result.rows[0].id,
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      whatsapp: whatsapp.trim(),
      destination: destination.trim(),
      duration: duration.trim(),
      budget: budget.trim(),
      notes: notes.trim(),
      created_at: new Date(result.rows[0].created_at)
        .toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    };

    console.log(`\n📩 LEAD MỚI — ${newLead.full_name}`);
    console.log(`   Email: ${newLead.email} | ${newLead.destination || '—'}`);
    console.log(`   ID: ${newLead.id}`);
    console.log('─'.repeat(45));

    // Gửi email + Sheets song song
    try {
      await Promise.all([
        sendOwnerNotification(newLead),
        sendGuestConfirmation(newLead),
        appendToSheet(newLead)
      ]);
      console.log('   ✅ Email + Sheets hoàn tất!');
    } catch (emailErr) {
      console.log('   ⚠️  Email/Sheets lỗi:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Cảm ơn! Chuyên gia sẽ liên hệ trong 24 giờ.',
      id: newLead.id
    });

  } catch (dbErr) {
    console.error('❌ DB Error:', dbErr.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

// ── 7. API: XEM DANH SÁCH LEADS ──────────────────────────
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM leads
      ORDER BY created_at DESC
      LIMIT 500
    `);
    return res.json({
      success: true,
      total: result.rowCount,
      leads: result.rows
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi truy vấn database.' });
  }
});

// ── 8. API: XOÁ LEAD ─────────────────────────────────────
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM leads WHERE id = $1 RETURNING full_name',
      [req.params.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'Không tìm thấy lead.' });

    console.log(`\n🗑️  Đã xoá lead — ${result.rows[0].full_name}`);
    return res.json({ success: true, message: 'Đã xoá thành công.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi xoá dữ liệu.' });
  }
});

// ── 9. API: CẬP NHẬT TRẠNG THÁI LEAD ────────────────────
app.patch('/api/leads/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['new', 'contacted', 'quoted', 'booked', 'closed'];

  if (!validStatuses.includes(status))
    return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });

  try {
    const result = await pool.query(
      'UPDATE leads SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'Không tìm thấy lead.' });

    return res.json({ success: true, lead: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật.' });
  }
});

// ── 10. TRANG ADMIN ───────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── 11. TRANG CHỦ ────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'vietnam-haute-voyage.html'));
});

// ── 12. KHỞI ĐỘNG ────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('  🌟  Vietnam Haute Voyage — Server đã chạy!');
  console.log('══════════════════════════════════════════════');
  console.log(`  🌐  Trang web:   http://localhost:${PORT}`);
  console.log(`  🔐  Admin:       http://localhost:${PORT}/admin`);
  console.log(`  📋  Xem leads:   http://localhost:${PORT}/api/leads`);
  console.log(`  🗄️   Database:    PostgreSQL (Railway)`);
  console.log(`  📧  Gmail:       ${process.env.GMAIL_USER || '(chưa cấu hình)'}`);
  console.log('══════════════════════════════════════════════\n');

  await initGoogleSheets();
});
