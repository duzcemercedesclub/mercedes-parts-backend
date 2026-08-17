const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Oturum açmanız gerekiyor.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secretkey', (err, user) => {
    if (err) return res.status(403).json({ message: 'Geçersiz token.' });
    req.user = user;
    next();
  });
};

// =======================================================
// ADMIN ROTALARI
// =======================================================

// 1. TÜM KUPONLARI VE KULLANICI BİLGİLERİNİ LİSTELE (GET /api/coupons/admin/list)
router.get('/admin/list', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        c.*,
        u.name AS user_name,
        u.surname AS user_surname,
        u.email AS user_email
       FROM coupons c
       LEFT JOIN users u ON c.user_id = u.id
       ORDER BY c.id DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Kupon getirme hatası:', error);
    res.status(500).json({ message: 'Kuponlar yüklenirken sunucu hatası oluştu.' });
  }
});

// 2. KULLANICIYA / HERKESE ÖZEL KUPON EKLE (POST /api/coupons/admin/create)
router.post('/admin/create', async (req, res) => {
  const {
    userId,
    code,
    title,
    description,
    discountAmount,
    discountType,
    minSpend,
    badge,
    startDate,
    endDate
  } = req.body;

  if (!code || !title || !discountAmount || !startDate || !endDate) {
    return res.status(400).json({ message: 'Lütfen gerekli tüm alanları doldurun.' });
  }

  try {
    // Kupon kodunun benzersizliğini kontrol et
    const [existing] = await db.query('SELECT id FROM coupons WHERE code = ?', [code.toUpperCase()]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Bu kupon kodu zaten kullanımda!' });
    }

    await db.query(
      `INSERT INTO coupons 
       (user_id, code, title, description, discount_amount, discount_type, min_spend, badge, start_date, end_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        code.toUpperCase(),
        title,
        description || '',
        discountAmount,
        discountType || 'fixed',
        minSpend || 0,
        badge || 'Fırsat',
        startDate,
        endDate
      ]
    );

    res.status(201).json({ message: 'Kupon başarıyla oluşturuldu ve atandı.' });
  } catch (error) {
    console.error('Kupon ekleme hatası:', error);
    res.status(500).json({ message: 'Kupon oluşturulurken hata oluştu.' });
  }
});

// 3. KUPON SİL / İPTAL ET (DELETE /api/coupons/admin/:id)
router.delete('/admin/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM coupons WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Silinecek kupon bulunamadı.' });
    }

    res.json({ message: 'Kupon başarıyla silindi.' });
  } catch (error) {
    console.error('Kupon silme hatası:', error);
    res.status(500).json({ message: 'Kupon silinirken hata oluştu.' });
  }
});

// =======================================================
// KULLANICI ROTALARI
// =======================================================

// 4. OTURUM AÇAN KULLANICININ KENDİ KUPONLARINI GETİR (GET /api/coupons/my-coupons)
router.get('/my-coupons', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Kullanıcıya özel tanımlanmış VEYA genel (user_id IS NULL) aktif kuponları getir
    const [rows] = await db.query(
      `SELECT * FROM coupons 
       WHERE (user_id = ? OR user_id IS NULL) 
         AND is_active = 1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Müşteri kupon çekme hatası:', error);
    res.status(500).json({ message: 'Kuponlarınız getirilemedi.' });
  }
});

module.exports = router;