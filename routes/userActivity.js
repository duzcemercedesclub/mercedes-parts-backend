const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// JWT Doğrulama Middleware
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

// ==========================================
// 1. SİPARİŞ ROTALARI
// ==========================================

// KULLANICININ AYLIK SİPARİŞLERİNİ VE İADE DURUMLARINI GETİR (GET)
router.get('/orders/monthly', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({ error: 'Yıl ve Ay parametreleri zorunludur.' });
  }

  try {
    const [orders] = await db.query(
      `SELECT 
        o.id,
        o.order_number AS orderNumber,
        o.total_amount AS totalAmount,
        o.order_status AS orderStatus,
        o.payment_status AS paymentStatus,
        o.cargo_company AS cargoCompany,
        o.tracking_number AS trackingNumber,
        o.created_at AS createdAt
      FROM orders o
      WHERE o.user_id = ? 
        AND YEAR(o.created_at) = ? 
        AND MONTH(o.created_at) = ?
      ORDER BY o.created_at DESC`,
      [userId, year, month]
    );

    if (orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map((o) => o.id);
    const placeholders = orderIds.map(() => '?').join(',');

    const [items] = await db.query(
      `SELECT 
        oi.order_id, 
        oi.product_id, 
        oi.product_name, 
        oi.price, 
        oi.quantity, 
        oi.total_price, 
        p.image_url,
        r.status AS returnStatus,
        r.id AS returnId
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN returns r ON (r.order_id = oi.order_id AND r.product_id = oi.product_id AND r.user_id = ?)
       WHERE oi.order_id IN (${placeholders})`,
      [userId, ...orderIds]
    );

    const formattedOrders = orders.map((order) => ({
      ...order,
      items: items
        .filter((item) => String(item.order_id) === String(order.id))
        .map((i) => ({
          id: i.product_id,
          name: i.product_name,
          price: Number(i.price || 0),
          quantity: Number(i.quantity || 1),
          totalPrice: Number(i.total_price || 0),
          image: i.image_url || 'https://via.placeholder.com/100',
          returnStatus: i.returnStatus || null,
          returnId: i.returnId || null
        }))
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.error('Aylık Sipariş Çekme Hatası:', error);
    res.status(500).json({ error: 'Siparişler çekilirken hata oluştu.' });
  }
});

// ==========================================
// 2. İADE ROTALARI
// ==========================================

// İADE TALEBİ OLUŞTUR (POST)
router.post('/returns', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { orderId, productId, reason, description } = req.body;

  if (!orderId || !productId || !reason) {
    return res.status(400).json({ message: 'Sipariş, ürün ve iade nedeni zorunludur.' });
  }

  try {
    const [existing] = await db.query(
      `SELECT id FROM returns WHERE user_id = ? AND order_id = ? AND product_id = ?`,
      [userId, orderId, productId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Bu ürün için zaten bir iade talebiniz bulunmaktadır.' });
    }

    const [result] = await db.query(
      `INSERT INTO returns (user_id, order_id, product_id, reason, description, status)
       VALUES (?, ?, ?, ?, ?, 'İade Talebi Alındı')`,
      [userId, orderId, productId, reason, description || '']
    );

    res.status(201).json({
      message: 'İade talebiniz başarıyla oluşturuldu.',
      returnId: result.insertId
    });
  } catch (error) {
    console.error('İade Talebi Hatası:', error);
    res.status(500).json({ message: 'İade talebi oluşturulurken bir hata oluştu.' });
  }
});

// ==========================================
// 3. DEĞERLENDİRME ROTALARI
// ==========================================

// KULLANICININ AYLIK DEĞERLENDİRMELERİNİ VE BEKLEYENLERİ GETİR (GET)
router.get('/reviews/monthly', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({ error: 'Yıl ve Ay parametreleri zorunludur.' });
  }

  try {
    const [completed] = await db.query(
      `SELECT 
        r.id,
        r.product_id AS productId,
        p.name AS productName,
        p.image_url AS productImage,
        r.rating,
        r.comment,
        r.status,
        r.created_at AS createdAt
      FROM reviews r
      JOIN products p ON r.product_id = p.id
      WHERE r.user_id = ? 
        AND YEAR(r.created_at) = ? 
        AND MONTH(r.created_at) = ?
      ORDER BY r.created_at DESC`,
      [userId, year, month]
    );

    const [pending] = await db.query(
      `SELECT DISTINCT
        oi.product_id AS productId,
        oi.product_name AS productName,
        p.image_url AS productImage,
        o.id AS orderId,
        o.created_at AS orderDate
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN reviews r ON (r.product_id = oi.product_id AND r.user_id = o.user_id)
      WHERE o.user_id = ? 
        AND o.order_status = 'Teslim Edildi'
        AND YEAR(o.created_at) = ? 
        AND MONTH(o.created_at) = ?
        AND r.id IS NULL`,
      [userId, year, month]
    );

    res.json({ completed, pending });
  } catch (error) {
    console.error('Aylık Değerlendirme Çekme Hatası:', error);
    res.status(500).json({ error: 'Değerlendirmeler çekilirken hata oluştu.' });
  }
});

// YENİ DEĞERLENDİRME VE YORUM EKLE (POST)
router.post('/reviews', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { productId, orderId, rating, comment } = req.body;

  if (!productId || !rating) {
    return res.status(400).json({ message: 'Ürün ve puan alanı zorunludur.' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO reviews (user_id, product_id, order_id, rating, comment, status) 
       VALUES (?, ?, ?, ?, ?, 'Onaylandı')`,
      [userId, productId, orderId || null, rating, comment || '']
    );

    res.status(201).json({
      message: 'Değerlendirmeniz başarıyla kaydedildi.',
      reviewId: result.insertId
    });
  } catch (error) {
    console.error('Değerlendirme Kaydetme Hatası:', error);
    res.status(500).json({ message: 'Değerlendirme eklenirken sunucu hatası oluştu.' });
  }
});

// ==========================================
// 4. KULLANICI SORU VE CEVAP ROTALARI
// ==========================================

// KULLANICININ TÜM SORULARINI GETİR (GET)
router.get('/questions', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [questions] = await db.query(
      `SELECT 
        q.id,
        q.question,
        q.answer AS reply,
        q.status,
        q.created_at AS date,
        p.id AS productId,
        p.name AS productName,
        p.image_url AS productImage,
        b.name AS storeName
      FROM product_questions q
      JOIN products p ON q.product_id = p.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE q.user_id = ?
      ORDER BY q.created_at DESC`,
      [userId]
    );

    const formattedQuestions = questions.map((q) => ({
      id: `TKT-${q.id}`,
      originalId: q.id,
      productId: q.productId,
      storeName: q.storeName || 'Mercedes OEM Mağazası',
      productName: q.productName,
      productImage: q.productImage || 'https://via.placeholder.com/100',
      question: q.question,
      reply: q.reply,
      date: new Date(q.date).toLocaleDateString('tr-TR'),
      status: q.status || (q.reply ? 'Mağaza Cevapladı' : 'Cevap Bekliyor'),
      statusType: q.reply ? 'success' : 'warning'
    }));

    res.json(formattedQuestions);
  } catch (error) {
    console.error('Kullanıcı soruları çekme hatası:', error);
    res.status(500).json({ message: 'Sorularınız getirilemedi.' });
  }
});

// YENİ SORU SOR (POST)
router.post('/questions', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { productId, question } = req.body;

  if (!productId || !question) {
    return res.status(400).json({ message: 'Ürün ve soru alanı zorunludur.' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO product_questions (user_id, product_id, question, status) VALUES (?, ?, ?, 'Cevap Bekliyor')`,
      [userId, productId, question]
    );

    res.status(201).json({
      message: 'Sorunuz mağazaya başarıyla iletildi.',
      questionId: result.insertId
    });
  } catch (error) {
    console.error('Soru oluşturma hatası:', error);
    res.status(500).json({ message: 'Soru iletilirken hata oluştu.' });
  }
});

module.exports = router;