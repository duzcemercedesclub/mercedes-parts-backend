const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Tablo Kontrolü
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
    console.error('Bakım modu tablosu hatası:', err);
  }
};

// Veri tabanından gelen is_active değerini kesin olarak boolean'a çeviren güvenli yardımcı fonksiyon
const parseBooleanValue = (val) => {
  if (val === true || val === 1 || val === '1') return true;
  if (Buffer.isBuffer(val)) return val[0] === 1;
  if (typeof val === 'object' && val !== null && val.data) return val.data[0] === 1;
  return Number(val) === 1;
};

// Admin Yetki Kontrolü
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Yetkilendirme eksik.' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Yetkisiz erişim.' });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Geçersiz token.' });
  }
};

// 1. Public Bakım Durumu Sorgusu
router.get('/status', async (req, res) => {
  try {
    await ensureTableExists();
    const [rows] = await db.query(
      'SELECT is_active, title, message, estimated_end_datetime FROM maintenance_settings WHERE id = 1'
    );

    if (!rows || rows.length === 0) {
      return res.json({
        is_active: false,
        title: 'Sitemiz Bakımdadır',
        message: 'Kısa süre sonra hizmetinizdeyiz.',
        estimated_end_datetime: null
      });
    }

    const isActive = parseBooleanValue(rows[0].is_active);

    res.json({
      is_active: isActive,
      title: rows[0].title || 'Sitemiz Bakımdadır',
      message: rows[0].message || 'Kısa süre sonra hizmetinizdeyiz.',
      estimated_end_datetime: rows[0].estimated_end_datetime
    });
  } catch (error) {
    console.error('Bakım durumu çekilirken hata:', error);
    res.status(500).json({ message: 'Veritabanı hatası.', is_active: false });
  }
});

// 2. Admin Ayar Getirme
router.get('/admin/settings', verifyAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const [rows] = await db.query('SELECT * FROM maintenance_settings WHERE id = 1');
    if (!rows || rows.length === 0) {
      return res.json({ is_active: false, title: 'Sitemiz Bakımdadır', message: '', estimated_end_datetime: null });
    }
    res.json({
      is_active: parseBooleanValue(rows[0].is_active),
      title: rows[0].title,
      message: rows[0].message,
      estimated_end_datetime: rows[0].estimated_end_datetime
    });
  } catch (error) {
    res.status(500).json({ message: 'Ayarlar çekilemedi.' });
  }
});

// 3. Admin Ayar Güncelleme
router.put('/admin/settings', verifyAdmin, async (req, res) => {
  const { is_active, title, message, estimated_end_datetime } = req.body;

  try {
    await ensureTableExists();
    const [existing] = await db.query('SELECT id FROM maintenance_settings WHERE id = 1');

    const activeVal = is_active ? 1 : 0;

    if (existing.length === 0) {
      await db.query(
        `INSERT INTO maintenance_settings (id, is_active, title, message, estimated_end_datetime) 
         VALUES (1, ?, ?, ?, ?)`,
        [activeVal, title, message, estimated_end_datetime || null]
      );
    } else {
      await db.query(
        `UPDATE maintenance_settings 
         SET is_active = ?, title = ?, message = ?, estimated_end_datetime = ?
         WHERE id = 1`,
        [activeVal, title, message, estimated_end_datetime || null]
      );
    }

    res.json({ message: 'Bakım modu ayarları başarıyla güncellendi.' });
  } catch (error) {
    console.error('Güncelleme hatası:', error);
    res.status(500).json({ message: 'Ayarlar kaydedilemedi.' });
  }
});

module.exports = router;