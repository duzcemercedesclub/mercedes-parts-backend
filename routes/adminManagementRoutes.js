const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

// Admin Doğrulama Middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Yetkisiz erişim. Oturum açınız.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secretkey', (err, user) => {
    if (err) return res.status(403).json({ message: 'Geçersiz veya süresi dolmuş token.' });
    req.user = user;
    next();
  });
};

// ==========================================
// 1. DASHBOARD İSTATİSTİKLERİ VE ÖZET
// ==========================================

router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // 1. Aylık Ciro ve Toplam Sipariş İstatistikleri
    const [salesStats] = await db.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) AS monthlyTurnover,
        COUNT(id) AS totalOrdersCount,
        SUM(CASE WHEN order_status = 'Teslim Edildi' OR order_status = 'Ödeme Yapıldı' THEN 1 ELSE 0 END) AS completedOrdersCount
      FROM orders 
      WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) 
        AND YEAR(created_at) = YEAR(CURRENT_DATE())
    `);

    // 2. Kritik Stok Verileri (Stok adedi 3 ve altında olan parçalar)
    const [criticalStocks] = await db.query(`
      SELECT name, sku AS oem, stock 
      FROM products 
      WHERE stock <= 3 
      ORDER BY stock ASC 
      LIMIT 5
    `);

    // 3. Son 5 Sipariş
    const [recentOrders] = await db.query(`
      SELECT 
        o.id,
        o.order_number AS orderNumber,
        o.total_amount AS totalAmount,
        o.order_status AS orderStatus,
        o.created_at AS createdAt,
        u.name AS userName,
        u.surname AS userSurname,
        o.shipping_address AS shippingAddress
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    // 4. Kritik Stok Sayısı
    const [criticalCount] = await db.query(`SELECT COUNT(*) AS count FROM products WHERE stock <= 3`);

    // 5. ÜRÜN İSİM VE AÇIKLAMASINDAN DİNAMİK KASA KODU SATIŞ ANALİZİ (W201, W124 vb.)
    const [productRows] = await db.query(`
      SELECT 
        p.name, 
        p.description,
        COALESCE(SUM(oi.quantity), 1) as total_sold
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.order_status != 'İptal Edildi'
      GROUP BY p.id
    `);

    const chassisMap = {
      'W201 (190 / 190E)': { count: 0, color: '#1677ff' },
      'W124 (E-Class)': { count: 0, color: '#52c41a' },
      'W204 (C-Class)': { count: 0, color: '#faad14' },
      'W211 (E-Class)': { count: 0, color: '#13c2c2' },
      'Diğer Kasa Kodları': { count: 0, color: '#8b5cf6' }
    };

    let totalChassisSales = 0;

    productRows.forEach(row => {
      const textToSearch = ((row.name || '') + ' ' + (row.description || '')).toUpperCase();
      const soldQty = Number(row.total_sold || 0);

      if (textToSearch.includes('W201') || textToSearch.includes('190E') || textToSearch.includes('190 E')) {
        chassisMap['W201 (190 / 190E)'].count += soldQty;
      } else if (textToSearch.includes('W124') || textToSearch.includes('E124')) {
        chassisMap['W124 (E-Class)'].count += soldQty;
      } else if (textToSearch.includes('W204')) {
        chassisMap['W204 (C-Class)'].count += soldQty;
      } else if (textToSearch.includes('W211')) {
        chassisMap['W211 (E-Class)'].count += soldQty;
      } else {
        chassisMap['Diğer Kasa Kodları'].count += soldQty;
      }

      totalChassisSales += soldQty;
    });

    const chassisSales = Object.keys(chassisMap).map(key => {
      const count = chassisMap[key].count;
      const percentage = totalChassisSales > 0 ? Math.round((count / totalChassisSales) * 100) : 0;
      return {
        model: key,
        count: `${count} Parça`,
        percentage,
        color: chassisMap[key].color
      };
    });

    res.json({
      stats: {
        monthlyTurnover: Number(salesStats[0]?.monthlyTurnover || 0),
        totalOrdersCount: salesStats[0]?.totalOrdersCount || 0,
        completedOrdersCount: salesStats[0]?.completedOrdersCount || 0,
        criticalStockCount: criticalCount[0]?.count || 0
      },
      criticalStocks,
      recentOrders,
      chassisSales
    });
  } catch (error) {
    console.error('Dashboard Veri Çekme Hatası:', error);
    res.status(500).json({ message: 'Dashboard verileri getirilirken hata oluştu.' });
  }
});

// ==========================================
// 2. DETAYLI STOK EXCEL RAPORU OLUŞTURMA
// ==========================================

router.get('/reports/stock-excel', authenticateAdmin, async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT p.id, p.name, p.sku, p.price, p.stock, p.created_at, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.stock ASC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stok Raporu');

    // Sütun Başlıkları
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Ürün / Parça Adı', key: 'name', width: 40 },
      { header: 'OEM / SKU Kodu', key: 'sku', width: 20 },
      { header: 'Kategori', key: 'category_name', width: 20 },
      { header: 'Fiyat (TL)', key: 'price', width: 15 },
      { header: 'Stok Adedi', key: 'stock', width: 15 },
      { header: 'Stok Durumu', key: 'stock_status', width: 18 },
      { header: 'Sisteme Ekleme Tarihi', key: 'created_at', width: 22 },
    ];

    // Başlık Stilini Özelleştirme (Lacivert Arka Plan, Beyaz Kalın Yazı)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '001529' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Verileri Ekleme
    products.forEach((p) => {
      let status = 'Stokta Var';
      if (p.stock === 0) status = 'Tükendi';
      else if (p.stock <= 3) status = 'Kritik Stok (Acil Tedarik)';

      const row = worksheet.addRow({
        id: p.id,
        name: p.name,
        sku: p.sku || '-',
        category_name: p.category_name || 'Genel Parça',
        price: Number(p.price || 0),
        stock: p.stock,
        stock_status: status,
        created_at: p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR') : '-'
      });

      // Stok durumuna göre renklendirme
      if (p.stock === 0) {
        row.getCell('stock_status').font = { color: { argb: 'EF4444' }, bold: true };
      } else if (p.stock <= 3) {
        row.getCell('stock_status').font = { color: { argb: 'D97706' }, bold: true };
      }
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Mercedes_Parca_Stok_Raporu_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel Raporu Oluşturma Hatası:', error);
    res.status(500).json({ message: 'Excel raporu indirilirken hata oluştu.' });
  }
});

// ==========================================
// 3. ÜRÜN YORUMLARI & DEĞERLENDİRMELERİ
// ==========================================

router.get('/reviews', authenticateAdmin, async (req, res) => {
  try {
    const [reviews] = await db.query(
      `SELECT 
        r.id, r.user_id, r.product_id, r.order_id, r.rating, r.comment, r.status, r.created_at,
        p.name AS product_name, p.image_url AS product_image,
        CONCAT(u.name, ' ', u.surname) AS user_name, u.email AS user_email
      FROM reviews r
      JOIN products p ON r.product_id = p.id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC`
    );
    res.json(reviews);
  } catch (error) {
    console.error('Admin yorum çekme hatası:', error);
    res.status(500).json({ message: 'Yorumlar getirilirken hata oluştu.' });
  }
});

router.put('/reviews/:id/status', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['Onaylandı', 'Reddedildi', 'Onay Bekliyor'].includes(status)) {
    return res.status(400).json({ message: 'Geçersiz durum bilgisi.' });
  }

  try {
    await db.query('UPDATE reviews SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: `Yorum durumu "${status}" olarak güncellendi.` });
  } catch (error) {
    console.error('Yorum durum güncelleme hatası:', error);
    res.status(500).json({ message: 'Yorum güncellenirken hata oluştu.' });
  }
});

router.delete('/reviews/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM reviews WHERE id = ?', [id]);
    res.json({ message: 'Yorum veritabanından silindi.' });
  } catch (error) {
    console.error('Yorum silme hatası:', error);
    res.status(500).json({ message: 'Yorum silinirken hata oluştu.' });
  }
});

// ==========================================
// 4. ÜRÜN SORULARI VE CEVAPLARI
// ==========================================

router.get('/questions', authenticateAdmin, async (req, res) => {
  try {
    const [questions] = await db.query(
      `SELECT 
        q.id, q.user_id, q.product_id, q.question, q.answer, q.answered_at, q.status, q.created_at,
        p.name AS product_name, p.image_url AS product_image,
        CONCAT(u.name, ' ', u.surname) AS user_name, u.email AS user_email
      FROM product_questions q
      JOIN products p ON q.product_id = p.id
      JOIN users u ON q.user_id = u.id
      ORDER BY q.created_at DESC`
    );
    res.json(questions);
  } catch (error) {
    console.error('Admin soru çekme hatası:', error);
    res.status(500).json({ message: 'Sorular getirilirken hata oluştu.' });
  }
});

router.put('/questions/:id/answer', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;

  if (!answer || answer.trim() === '') {
    return res.status(400).json({ message: 'Cevap metni boş olamaz.' });
  }

  try {
    await db.query(
      `UPDATE product_questions 
       SET answer = ?, answered_at = NOW(), status = 'Cevaplandı' 
       WHERE id = ?`,
      [answer.trim(), id]
    );
    res.json({ message: 'Soru başarıyla cevaplandı.' });
  } catch (error) {
    console.error('Soru cevaplama hatası:', error);
    res.status(500).json({ message: 'Soru cevaplanırken hata oluştu.' });
  }
});

router.delete('/questions/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM product_questions WHERE id = ?', [id]);
    res.json({ message: 'Soru veritabanından silindi.' });
  } catch (error) {
    console.error('Soru silme hatası:', error);
    res.status(500).json({ message: 'Soru silinirken hata oluştu.' });
  }
});

module.exports = router;