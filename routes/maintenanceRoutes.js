const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Tablonun varlığını ve varsayılan yapıyı garanti eden yardımcı fonksiyon
const ensureTableExists = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS maintenance_settings (
        id INT PRIMARY KEY DEFAULT 1,
        is_active TINYINT(1) DEFAULT 0,
        title VARCHAR(255) DEFAULT 'Sitemiz Bakımdadır',
        message TEXT,
        estimated_end_datetime DATETIME NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.error('Bakım modu tablosu oluşturulurken/kontrol edilirken hata:', err);
  }
};

// JWT Token Doğrulama Middleware (Admin Yetkisi İçin)
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Yetkilendirme başlığı bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Erişim engellendi, token eksik.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Bu işlem için admin yetkisi gereklidir.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Geçersiz veya süresi dolmuş token.' });
  }
};

// 1. Genel Kullanıcı İçin Bakım Modu Durumunu Getir (Public - Herkes Erişebilir)
router.get('/status', async (req, res) => {
  try {
    await ensureTableExists();
    const [rows] = await db.query(
      'SELECT is_active, title, message, estimated_end_datetime FROM maintenance_settings WHERE id = 1'
    );
    if (rows.length === 0) {
      return res.json({
        is_active: false,
        title: 'Sitemiz Bakımdadır',
        message: 'Kısa süre sonra hizmetinizdeyiz.',
        estimated_end_datetime: null
      });
    }
    res.json({
      is_active: Boolean(rows[0].is_active),
      title: rows[0].title || 'Sitemiz Bakımdadır',
      message: rows[0].message || 'Kısa süre sonra hizmetinizdeyiz.',
      estimated_end_datetime: rows[0].estimated_end_datetime
    });
  } catch (error) {
    console.error('Bakım durumu çekilirken hata:', error);
    res.status(500).json({ message: 'Veritabanı hatası.', error: error.message });
  }
});

// 2. Admin İçin Tüm Bakım Ayarlarını Getir (Protected)
router.get('/admin/settings', verifyAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const [rows] = await db.query('SELECT * FROM maintenance_settings WHERE id = 1');
    if (rows.length === 0) {
      return res.json({
        is_active: false,
        title: 'Sitemiz Bakımdadır',
        message: 'Sizlere daha iyi hizmet verebilmek için altyapımızı güncelliyoruz.',
        estimated_end_datetime: null
      });
    }
    res.json({
      is_active: Boolean(rows[0].is_active),
      title: rows[0].title,
      message: rows[0].message,
      estimated_end_datetime: rows[0].estimated_end_datetime
    });
  } catch (error) {
    console.error('Ayarlar çekilirken hata:', error);
    res.status(500).json({ message: 'Ayarlar çekilirken hata oluştu.', error: error.message });
  }
});

// 3. Admin Bakım Modunu Güncelle (Protected & Garantili Kayıt)
router.put('/admin/settings', verifyAdmin, async (req, res) => {
  const { is_active, title, message, estimated_end_datetime } = req.body;

  try {
    await ensureTableExists();

    // 1. Önce id = 1 kaydının veritabanında var olup olmadığını kontrol et
    const [existing] = await db.query('SELECT id FROM maintenance_settings WHERE id = 1');

    if (existing.length === 0) {
      // Kayıt hiç yoksa İLK DEFA EKLE (INSERT)
      await db.query(
        `INSERT INTO maintenance_settings (id, is_active, title, message, estimated_end_datetime) 
         VALUES (1, ?, ?, ?, ?)`,
        [is_active ? 1 : 0, title, message, estimated_end_datetime || null]
      );
    } else {
      // Kayıt zaten varsa GÜNCELLE (UPDATE)
      await db.query(
        `UPDATE maintenance_settings 
         SET is_active = ?, title = ?, message = ?, estimated_end_datetime = ?
         WHERE id = 1`,
        [is_active ? 1 : 0, title, message, estimated_end_datetime || null]
      );
    }

    res.json({ success: true, message: 'Bakım modu ayarları başarıyla veritabanına kaydedildi.' });
  } catch (error) {
    console.error('Bakım modu güncellenirken veritabanı hatası:', error);
    res.status(500).json({ message: 'Ayarlar veritabanına kaydedilemedi.', error: error.message });
  }
});

module.exports = router;