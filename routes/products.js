// JWT Doğrulama Middleware (Dosya başında yoksa ekleyin)
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Oturum açmanız gerekiyor.' });

  jwt.verify(token, process.env.JWT_SECRET || 'secretkey', (err, user) => {
    if (err) return res.status(403).json({ message: 'Geçersiz token.' });
    req.user = user;
    next();
  });
};

// ==========================================
// ÜRÜN YORUMLARI VE DEĞERLENDİRMELERİ
// ==========================================

// 1. ÜRÜNE AİT TÜM YORUMLARI VE ÖZET PUANI GETİR (GET)
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
// ÜRÜN SORU VE CEVAPLARI
// ==========================================

// 2. ÜRÜNE AİT TÜM SORU VE CEVAPLARI GETİR (GET)
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

// 3. ÜRÜNE YENİ SORU SOR (POST)
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