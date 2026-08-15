const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { upload, uploadToCloudinary } = require('../config/cloudinary');
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
// 1. ÜRÜN YÖNETİM ROTALARI
// ==========================================

// TÜM ÜRÜNLERİ LİSTELE (GET)
router.get('/', async (req, res) => {
    try {
        const sql = `
            SELECT p.*, c.name AS category_name, b.name AS brand_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ORDER BY p.id DESC
        `;
        const [rows] = await db.query(sql);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ürün listesi getirilemedi.' });
    }
});

// ŞASE NO İLE ÜRÜN ARA (GET) -> :id rotasından ÖNCE tanımlanmalıdır!
router.get('/vin/:vin', async (req, res) => {
    const vin = req.params.vin.trim();
    try {
        const sql = `
            SELECT p.*, c.name AS category_name, b.name AS brand_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE LOWER(p.vin_code) LIKE LOWER(?)
            ORDER BY p.id DESC
        `;
        const [rows] = await db.query(sql, [`%${vin}%`]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Şase No arama hatası:', error);
        res.status(500).json({ message: 'Şase numarası ile arama yapılırken hata oluştu.' });
    }
});

// TEKİL ÜRÜN DETAYI GETİR (GET)
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Ürün bulunamadı.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// YENİ ÜRÜN EKLE (POST)
router.post('/', upload.single('image'), async (req, res) => {
    const { name, sku, category_id, brand_id, price, discount_rate, stock, condition_type, description, vin_code, is_active } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Lütfen ürün için ana görseli yükleyin.' });
    }

    const originalPrice = parseFloat(price);
    const discount = parseInt(discount_rate) || 0;
    const salePrice = originalPrice - (originalPrice * (discount / 100));

    try {
        const imageUrl = await uploadToCloudinary(req.file.buffer, 'products');

        const sql = `INSERT INTO products 
            (name, sku, category_id, brand_id, price, discount_rate, sale_price, stock, condition_type, description, vin_code, image_url, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
        const [result] = await db.query(sql, [
            name, 
            sku, 
            category_id, 
            brand_id, 
            originalPrice, 
            discount, 
            salePrice.toFixed(2), 
            stock || 0, 
            condition_type || 'new', 
            description, 
            vin_code || null,
            imageUrl, 
            is_active === 'true' || is_active === '1' ? 1 : 0
        ]);

        res.status(201).json({ message: 'Ürün başarıyla eklendi.', productId: result.insertId });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Bu Stok Kodu (SKU) ile başka bir ürün kayıtlıdır.' });
        }
        res.status(500).json({ message: 'Ürün eklenirken teknik bir hata oluştu.' });
    }
});

// ÜRÜN GÜNCELLE (PUT)
router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { name, sku, category_id, brand_id, price, discount_rate, stock, condition_type, description, vin_code, is_active, current_image } = req.body;

    const originalPrice = parseFloat(price);
    const discount = parseInt(discount_rate) || 0;
    const salePrice = originalPrice - (originalPrice * (discount / 100));

    try {
        let imageUrl = current_image;

        if (req.file) {
            imageUrl = await uploadToCloudinary(req.file.buffer, 'products');
        }

        const sql = `UPDATE products SET 
            name = ?, sku = ?, category_id = ?, brand_id = ?, price = ?, 
            discount_rate = ?, sale_price = ?, stock = ?, condition_type = ?, description = ?, vin_code = ?, image_url = ?, is_active = ? 
            WHERE id = ?`;

        await db.query(sql, [
            name, 
            sku, 
            category_id, 
            brand_id, 
            originalPrice, 
            discount, 
            salePrice.toFixed(2), 
            stock, 
            condition_type || 'new', 
            description, 
            vin_code || null,
            imageUrl, 
            is_active === 'true' || is_active === '1' ? 1 : 0, 
            id
        ]);

        res.status(200).json({ message: 'Ürün başarıyla güncellendi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Ürün güncellenirken hata oluştu.' });
    }
});

// ÜRÜN SİL (DELETE)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Ürün başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Ürün silme işlemi başarısız.' });
    }
});

// ==========================================
// 2. ÜRÜN YORUMLARI VE DEĞERLENDİRMELERİ
// ==========================================

router.get('/:id/reviews', async (req, res) => {
  const productId = req.params.id;
  try {
    const [reviews] = await db.query(
      `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at AS createdAt,
        CONCAT(SUBSTRING(u.name, 1, 1), '*** ', SUBSTRING(u.surname, 1, 1), '***') AS userName
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND (r.status = 'Onaylandı' OR r.status IS NULL)
      ORDER BY r.created_at DESC`,
      [productId]
    );

    const [stats] = await db.query(
      `SELECT 
        COUNT(*) as totalReviews,
        AVG(rating) as avgRating
      FROM reviews
      WHERE product_id = ? AND (status = 'Onaylandı' OR status IS NULL)`,
      [productId]
    );

    res.json({
      reviews,
      totalReviews: stats[0].totalReviews || 0,
      avgRating: Number(stats[0].avgRating || 0).toFixed(1)
    });
  } catch (error) {
    console.error('Yorum çekme hatası:', error);
    res.status(500).json({ message: 'Yorumlar yüklenirken hata oluştu.' });
  }
});

// ==========================================
// 3. ÜRÜN SORU VE CEVAPLARI
// ==========================================

router.get('/:id/questions', async (req, res) => {
  const productId = req.params.id;
  try {
    const [questions] = await db.query(
      `SELECT 
        q.id,
        q.question,
        q.answer,
        q.status,
        q.created_at AS createdAt,
        q.answered_at AS answeredAt,
        CONCAT(SUBSTRING(u.name, 1, 1), '*** ', SUBSTRING(u.surname, 1, 1), '***') AS userName
      FROM product_questions q
      JOIN users u ON q.user_id = u.id
      WHERE q.product_id = ?
      ORDER BY q.created_at DESC`,
      [productId]
    );

    res.json(questions);
  } catch (error) {
    console.error('Soru çekme hatası:', error);
    res.status(500).json({ message: 'Sorular yüklenirken hata oluştu.' });
  }
});

router.post('/:id/questions', authenticateToken, async (req, res) => {
  const productId = req.params.id;
  const userId = req.user.id;
  const { question } = req.body;

  if (!question || question.trim() === '') {
    return res.status(400).json({ message: 'Lütfen bir soru yazınız.' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO product_questions (user_id, product_id, question, status) VALUES (?, ?, ?, 'Cevap Bekliyor')`,
      [userId, productId, question.trim()]
    );

    res.status(201).json({
      message: 'Sorunuz satıcıya iletildi. En kısa sürede cevaplanacaktır.',
      questionId: result.insertId
    });
  } catch (error) {
    console.error('Soru ekleme hatası:', error);
    res.status(500).json({ message: 'Soru iletilirken sunucu hatası oluştu.' });
  }
});

module.exports = router;