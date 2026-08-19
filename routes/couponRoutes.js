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
    if (err) return res.status(403).json({ message: 'Geçersiz veya süresi dolmuş token.' });
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

// 5. SEPETTE KUPON DOĞRULAMA VE UYGULAMA (POST /api/coupons/validate)
router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    const userId = req.user.id;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Lütfen bir kupon kodu giriniz.' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Kuponu veritabanından sorgula
    const [rows] = await db.query(
      `SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1 LIMIT 1`,
      [cleanCode]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Geçersiz veya aktif olmayan kupon kodu.' });
    }

    const coupon = rows[0];

    // Kullanıcıya özel kupon kontrolü (Genel kuponlarda user_id null olur)
    if (coupon.user_id && coupon.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Bu kupon sizin hesabınıza tanımlı değildir.' });
    }

    // Tarih Kontrolü (Başlangıç ve Bitiş)
    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      return res.status(400).json({ success: false, message: 'Bu kupon henüz kullanıma açılmamıştır.' });
    }
    if (coupon.end_date && new Date(coupon.end_date) < now) {
      return res.status(400).json({ success: false, message: 'Bu kuponun kullanım süresi dolmuştur.' });
    }

    // Minimum Sepet Tutarı Kontrolü
    const cartSubtotal = Number(subtotal) || 0;
    const minSpend = Number(coupon.min_spend) || 0;

    if (minSpend > 0 && cartSubtotal < minSpend) {
      return res.status(400).json({ 
        success: false, 
        message: `Bu kuponu kullanabilmek için sepet tutarının en az ${minSpend} TL olması gerekmektedir.` 
      });
    }

    // Tüm kontroller başarılı
    return res.json({
      success: true,
      message: 'Kupon başarıyla uygulandı.',
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        discount_type: coupon.discount_type, // 'percentage' veya 'fixed'
        discount_amount: coupon.discount_amount,
        min_spend: coupon.min_spend
      }
    });

  } catch (error) {
    console.error('Kupon doğrulama hatası:', error);
    return res.status(500).json({ success: false, message: 'Kupon doğrulanırken bir sunucu hatası oluştu.' });
  }
});

module.exports = router;