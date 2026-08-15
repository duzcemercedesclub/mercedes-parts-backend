const express = require('express');
const router = express.Router();
const orders = require('../store/orderStore');

// GET /api/admin/orders
router.get('/', (req, res) => {
  res.json(orders);
});

// PATCH /api/admin/orders/:id (Sipariş Durumu Güncelleme)
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const order = orders.find((o) => o.id === id);

  if (order) {
    order.status = status;
    return res.json(order);
  }
  res.status(404).json({ error: 'Sipariş bulunamadı.' });
});

module.exports = router;