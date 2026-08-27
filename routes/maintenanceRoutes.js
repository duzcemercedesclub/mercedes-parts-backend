const express = require('express');
const router = express.Router();
const db = require('../config/db');

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
    const jwt = require('jsonwebtoken');
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
    const [rows] = await db.query(
      'SELECT is_active, title, message, estimated_end_datetime FROM maintenance_settings WHERE id = 1'
    );
    if (rows.length === 0) {
      return res.json({
        is_active: 0,
        title: 'Sitemiz Bakımdadır',
        message: 'Kısa süre sonra hizmetinizdeyiz.',
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
    console.error('Bakım durumu çekilirken hata:', error);
    res.status(500).json({ message: 'Veritabanı hatası.' });
  }
});

// 2. Admin İçin Tüm Bakım Ayarlarını Getir (Protected)
router.get('/admin/settings', verifyAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM maintenance_settings WHERE id = 1');
    if (rows.length === 0) {
      return res.json({ is_active: false, title: '', message: '', estimated_end_datetime: null });
    }
    res.json({
      is_active: Boolean(rows[0].is_active),
      title: rows[0].title,
      message: rows[0].message,
      estimated_end_datetime: rows[0].estimated_end_datetime
    });
  } catch (error) {
    res.status(500).json({ message: 'Ayarlar çekilirken hata oluştu.' });
  }
});

// 3. Admin Bakım Modunu Güncelle (Protected)
router.put('/admin/settings', verifyAdmin, async (req, res) => {
  const { is_active, title, message, estimated_end_datetime } = req.body;

  try {
    await db.query(
      `UPDATE maintenance_settings 
       SET is_active = ?, title = ?, message = ?, estimated_end_datetime = ?
       WHERE id = 1`,
      [is_active ? 1 : 0, title, message, estimated_end_datetime || null]
    );
    res.json({ message: 'Bakım modu ayarları başarıyla güncellendi.' });
  } catch (error) {
    console.error('Bakım modu güncellenirken hata:', error);
    res.status(500).json({ message: 'Ayarlar kaydedilemedi.' });
  }
});

module.exports = router;