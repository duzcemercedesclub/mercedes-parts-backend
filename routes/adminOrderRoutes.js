const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/admin/orders - Tüm Siparişleri Getir
router.get('/', async (req, res) => {
  try {
    const [orders] = await db.query(`
      SELECT 
        o.id,
        o.order_number AS orderNumber,
        o.stripe_session_id AS stripeSessionId,
        o.subtotal,
        o.shipping_cost AS shippingCost,
        o.discount_amount AS discountAmount,
        o.total_amount AS totalAmount,
        o.payment_status AS paymentStatus,
        o.order_status AS orderStatus,
        o.cargo_company AS cargoCompany,
        o.tracking_number AS trackingNumber,
        o.shipping_address AS shippingAddress,
        o.billing_address AS billingAddress,
        o.created_at AS createdAt,
        u.id AS userId,
        u.name AS userName,
        u.surname AS userSurname,
        u.email AS userEmail
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);

    if (!orders || orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map((o) => o.id);
    const placeholders = orderIds.map(() => '?').join(',');

    // Ürünleri Çek
    const [items] = await db.query(
      `SELECT order_id, product_id, product_name, price, quantity, total_price 
       FROM order_items 
       WHERE order_id IN (${placeholders})`,
      orderIds
    );

    // İade Taleplerini Çek (Hata durumunda çökmemesi için try-catch ile korundu)
    let returnsMap = {};
    try {
      const [returns] = await db.query(
        `SELECT order_id, reason, description, status, created_at FROM returns WHERE order_id IN (${placeholders})`,
        orderIds
      );
      returns.forEach((r) => {
        returnsMap[r.order_id] = r;
      });
    } catch (err) {
      console.warn('İade tablosu okunamadı veya henüz oluşturulmadı:', err.message);
    }

    const formattedOrders = orders.map((order) => {
      const orderItems = items
        .filter((item) => String(item.order_id) === String(order.id))
        .map((item) => ({
          id: item.product_id,
          name: item.product_name,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1),
          totalPrice: Number(item.total_price || 0),
        }));

      let parsedAddress = order.shippingAddress;
      if (typeof order.shippingAddress === 'string') {
        try {
          parsedAddress = JSON.parse(order.shippingAddress);
        } catch (e) {
          parsedAddress = order.shippingAddress;
        }
      }

      const ret = returnsMap[order.id];

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        user: {
          id: order.userId,
          name: `${order.userName || ''} ${order.userSurname || ''}`.trim() || 'Müşteri',
          email: order.userEmail || '-',
          address: parsedAddress,
        },
        paymentInfo: {
          method: order.payment_method || 'Kredi Kartı',
          cardLast4: order.card_last4 || null,
          cardBrand: order.card_brand || null,
          iban: order.iban || null,
          paymentStatus: order.paymentStatus
        },
        returnData: ret ? {
          reason: ret.reason,
          description: ret.description,
          status: ret.status,
          createdAt: ret.created_at
        } : null,
        totalAmount: Number(order.totalAmount || 0),
        orderStatus: order.orderStatus || 'Ödeme Yapıldı',
        cargoCompany: order.cargoCompany || '',
        trackingNumber: order.trackingNumber || '',
        createdAt: order.createdAt,
        items: orderItems,
      };
    });

    res.json(formattedOrders);
  } catch (error) {
    console.error('Siparişleri Alma Hatası:', error);
    res.status(500).json({ error: 'Siparişler çekilirken veritabanı hatası oluştu.', detail: error.message });
  }
});

// PATCH /api/admin/orders/:id/cancel - Müşteri İptali
router.patch('/:id/cancel', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      `UPDATE orders 
       SET order_status = 'İptal Edildi' 
       WHERE id = ? AND order_status IN ('Ödeme Yapıldı', 'Sipariş Verildi', 'Hazırlanıyor')`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Sipariş iptal edilebilir durumda değil veya bulunamadı.' });
    }

    res.json({ message: 'Siparişiniz başarıyla iptal edildi.', id });
  } catch (error) {
    console.error('Sipariş İptal Hatası:', error);
    res.status(500).json({ error: 'Sipariş iptal edilirken veritabanı hatası oluştu.' });
  }
});

// PATCH /api/admin/orders/:id - Admin Tarafından Güncelleme
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { orderStatus, cargoCompany, trackingNumber } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE orders 
       SET order_status = ?, cargo_company = ?, tracking_number = ? 
       WHERE id = ?`,
      [orderStatus, cargoCompany || null, trackingNumber || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Güncellenecek sipariş bulunamadı.' });
    }

    if (orderStatus === 'İade Onaylandı (Para İadesi Yapıldı)') {
      await db.query(`UPDATE returns SET status = 'Onaylandı' WHERE order_id = ?`, [id]);
    } else if (orderStatus === 'İade Reddedildi') {
      await db.query(`UPDATE returns SET status = 'Reddedildi' WHERE order_id = ?`, [id]);
    }

    res.json({ 
      message: 'Sipariş ve İade bilgileri başarıyla güncellendi.', 
      id, 
      orderStatus, 
      cargoCompany, 
      trackingNumber 
    });
  } catch (error) {
    console.error('Sipariş Güncelleme Hatası:', error);
    res.status(500).json({ error: 'Sipariş bilgileri güncellenemedi.' });
  }
});

module.exports = router;