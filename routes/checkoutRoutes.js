const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendEmail } = require('../utils/mailer');
const db = require('../config/db');

// Otomatik Sipariş Numarası Oluşturucu (Örn: ORD-20260809-8A3F)
const generateOrderNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${dateStr}-${randomStr}`;
};

// 1. STRIPE CHECKOUT OTURUMU OLUŞTURMA
router.post('/create-session', async (req, res) => {
  try {
    const { items, user, shippingCost, discountAmount, totalAmount } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Sepetinizde ürün bulunmamaktadır.' });
    }

    const lineItems = items.map((item) => ({
      price_data: {
        currency: 'try',
        product_data: {
          name: item.name,
          images: item.imgUrl || item.image_url ? [item.imgUrl || item.image_url] : [],
        },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: item.quantity,
    }));

    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'try',
          product_data: { name: 'Kargo Ücreti' },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    const orderNumber = generateOrderNumber();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: user.email,
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/cart`,
      metadata: {
        userId: String(user.id),
        orderNumber: orderNumber,
        shippingCost: String(shippingCost),
        discountAmount: String(discountAmount),
        totalAmount: String(totalAmount),
        shippingAddress: typeof user.address === 'object' ? JSON.stringify(user.address) : String(user.address || ''),
        billingAddress: typeof user.billingAddress === 'object' ? JSON.stringify(user.billingAddress) : String(user.billingAddress || user.address || ''),
      },
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Oturum Hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. ÖDEME BAŞARILI SONRASI MYSQL VERİTABANINA KAYIT VE DOĞRULAMA
router.post('/confirm-order', async (req, res) => {
  const { sessionId, items } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID gereklidir.' });
  }

  const connection = await db.getConnection();

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Ödeme henüz tamamlanmadı.' });
    }

    // Daha önce eklenip eklenmediğini kontrol et
    const [existingOrders] = await connection.query(
      'SELECT id, order_number FROM orders WHERE stripe_session_id = ?',
      [sessionId]
    );

    if (existingOrders.length > 0) {
      return res.json({ 
        success: true, 
        orderNumber: existingOrders[0].order_number, 
        message: 'Sipariş zaten kayıtlı.' 
      });
    }

    const { userId, orderNumber, shippingCost, discountAmount, totalAmount, shippingAddress, billingAddress } = session.metadata;

    await connection.beginTransaction();

    // Orders Tablosuna Ekle
    const [orderResult] = await connection.query(
      `INSERT INTO orders 
      (order_number, user_id, stripe_session_id, subtotal, shipping_cost, discount_amount, total_amount, payment_status, shipping_address, billing_address) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        userId,
        sessionId,
        (session.amount_total / 100) - Number(shippingCost) + Number(discountAmount),
        Number(shippingCost),
        Number(discountAmount),
        Number(totalAmount),
        'completed',
        shippingAddress,
        billingAddress,
      ]
    );

    const insertedOrderId = orderResult.insertId;

    // Order Items Tablosuna Ekle
    for (const item of items) {
      const itemPrice = Number(item.price) || 0;
      const itemQty = Number(item.quantity) || 1;

      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, total_price) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [insertedOrderId, item.id, item.name, itemPrice, itemQty, itemPrice * itemQty]
      );

      // Stok miktarını düş
      await connection.query(
        `UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?`,
        [itemQty, item.id]
      );
    }

    await connection.commit();

    // Müşteriye Sipariş Onay E-postası Gönderimi
    const customerEmail = session.customer_details?.email || session.customer_email;
    if (customerEmail) {
      try {
        await sendEmail({
          to: customerEmail,
          subject: `Siparişiniz Alındı - #${orderNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
              <h2 style="color: #16a34a; margin-top: 0;">Teşekkürler, Siparişiniz Alındı!</h2>
              <p>Sipariş Numaranız: <strong>#${orderNumber}</strong></p>
              <p>Toplam Tutar: <strong>${totalAmount} TL</strong></p>
              <p>Siparişiniz hazırlanmaya başladığında tekrar bilgilendirileceksiniz.</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Sipariş e-postası gönderilirken hata oluştu:', emailError);
      }
    }

    res.json({ success: true, orderNumber });
  } catch (error) {
    await connection.rollback();
    console.error('Sipariş Veritabanı Kayıt Hatası:', error);
    res.status(500).json({ error: 'Sipariş veritabanına kaydedilirken hata oluştu.' });
  } finally {
    connection.release();
  }
});

module.exports = router;