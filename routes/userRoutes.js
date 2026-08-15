const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// JWT Middleware
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

// KULLANICININ KENDİ PROFİL BİLGİLERİNİ GETİR (GET /api/users/profile)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        u.id, u.name, u.surname, u.email, u.phone_code, u.phone, u.gender, u.role, u.is_marketing_accepted, u.created_at,
        ui.sms_notification, ui.email_notification, ui.saved_cards, ui.iban, ui.address, ui.billing_address, ui.updated_at
       FROM users u
       LEFT JOIN user_informations ui ON u.email = ui.email
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const user = rows[0];

    let parsedAddress = {};
    let parsedBilling = {};

    try {
      parsedAddress = user.address ? JSON.parse(user.address) : {};
    } catch (e) {
      parsedAddress = { addressDetail: user.address };
    }

    try {
      parsedBilling = user.billing_address ? JSON.parse(user.billing_address) : {};
    } catch (e) {
      parsedBilling = { billing_detail: user.billing_address };
    }

    res.json({
      ...user,
      parsedAddress,
      parsedBilling
    });
  } catch (error) {
    console.error('Profil verisi çekilirken hata:', error);
    res.status(500).json({ message: 'Profil bilgileri getirilirken bir sunucu hatası oluştu.' });
  }
});

// TÜM KULLANICILARI VE BİRLEŞİK PROFİL DETAYLARINI GETİR (GET /api/users)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        u.id, u.name, u.surname, u.email, u.phone_code, u.phone, u.gender, u.role, u.is_marketing_accepted, u.created_at,
        ui.sms_notification, ui.email_notification, ui.saved_cards, ui.iban, ui.address, ui.billing_address, ui.updated_at
       FROM users u
       LEFT JOIN user_informations ui ON u.email = ui.email
       ORDER BY u.id DESC`
    );

    // Adres ve Fatura verilerini JSON parse ederek düzenleme
    const usersWithParsedDetails = rows.map((user) => {
      let parsedAddress = {};
      let parsedBilling = {};

      try {
        parsedAddress = user.address ? JSON.parse(user.address) : {};
      } catch (e) {
        parsedAddress = { addressDetail: user.address };
      }

      try {
        parsedBilling = user.billing_address ? JSON.parse(user.billing_address) : {};
      } catch (e) {
        parsedBilling = { billing_detail: user.billing_address };
      }

      return {
        ...user,
        parsedAddress,
        parsedBilling
      };
    });

    res.json(usersWithParsedDetails);
  } catch (error) {
    console.error('Kullanıcı verileri çekilirken hata:', error);
    res.status(500).json({ message: 'Kullanıcılar getirilirken bir sunucu hatası oluştu.' });
  }
});

// ADRES VE FATURA BİLGİLERİNİ KAYDET / GÜNCELLE
router.put('/profile/addresses', authenticateToken, async (req, res) => {
  const {
    fullName,
    phoneCode,
    phone,
    country,
    city,
    district,
    neighborhood,
    addressDetail,
    title,
    invoiceType,
    tcNo,
    companyName,
    taxOffice,
    taxNo
  } = req.body;

  try {
    const [userRows] = await db.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
    if (userRows.length === 0) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    const userEmail = userRows[0].email;

    const addressObject = JSON.stringify({
      fullName,
      phoneCode,
      phone,
      country,
      city,
      district,
      neighborhood,
      addressDetail,
      title
    });

    const billingObject = JSON.stringify({
      invoiceType,
      tcNo: invoiceType === 'bireysel' ? tcNo : null,
      companyName: invoiceType === 'kurumsal' ? companyName : null,
      taxOffice: invoiceType === 'kurumsal' ? taxOffice : null,
      taxNo: invoiceType === 'kurumsal' ? taxNo : null
    });

    // Kullanıcının ana telefon numarasını da güncelle
    if (phone) {
      await db.query('UPDATE users SET phone = ?, phone_code = ? WHERE id = ?', [phone, phoneCode || '+90', req.user.id]);
    }

    const [existing] = await db.query('SELECT id FROM user_informations WHERE email = ?', [userEmail]);

    if (existing.length > 0) {
      await db.query(
        'UPDATE user_informations SET address = ?, billing_address = ?, updated_at = NOW() WHERE email = ?',
        [addressObject, billingObject, userEmail]
      );
    } else {
      await db.query(
        'INSERT INTO user_informations (email, address, billing_address) VALUES (?, ?, ?)',
        [userEmail, addressObject, billingObject]
      );
    }

    res.json({ message: 'Adres ve fatura bilgileriniz başarıyla güncellendi.' });
  } catch (error) {
    console.error('Adres kaydetme hatası:', error);
    res.status(500).json({ message: 'Adres bilgileri kaydedilemedi.' });
  }
});

// Kişisel Bilgileri Güncelle
router.put('/profile/info', authenticateToken, async (req, res) => {
  const { name, surname, phone, gender } = req.body;
  try {
    await db.query('UPDATE users SET name = ?, surname = ?, phone = ?, gender = ? WHERE id = ?', [
      name,
      surname,
      phone || null,
      gender || 'unspecified',
      req.user.id
    ]);
    res.json({ message: 'Bilgileriniz güncellendi.' });
  } catch (err) {
    res.status(500).json({ message: 'Güncelleme hatası.' });
  }
});

// Şifre Değiştir
router.put('/profile/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) return res.status(400).json({ message: 'Mevcut şifreniz hatalı.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    res.json({ message: 'Şifreniz güncellendi.' });
  } catch (err) {
    res.status(500).json({ message: 'Şifre değiştirilemedi.' });
  }
});

// İletişim Tercihlerini Güncelle
router.put('/profile/communications', authenticateToken, async (req, res) => {
  const { sms_notification, email_notification, is_marketing_accepted } = req.body;
  try {
    const [userRows] = await db.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
    const userEmail = userRows[0].email;
    await db.query('UPDATE users SET is_marketing_accepted = ? WHERE id = ?', [is_marketing_accepted ? 1 : 0, req.user.id]);

    const [existing] = await db.query('SELECT id FROM user_informations WHERE email = ?', [userEmail]);
    if (existing.length > 0) {
      await db.query(
        'UPDATE user_informations SET sms_notification = ?, email_notification = ?, updated_at = NOW() WHERE email = ?',
        [sms_notification ? 1 : 0, email_notification ? 1 : 0, userEmail]
      );
    } else {
      await db.query(
        'INSERT INTO user_informations (email, sms_notification, email_notification) VALUES (?, ?, ?)',
        [userEmail, sms_notification ? 1 : 0, email_notification ? 1 : 0]
      );
    }
    res.json({ message: 'İletişim tercihleriniz güncellendi.' });
  } catch (err) {
    res.status(500).json({ message: 'Güncelleme hatası.' });
  }
});

// Ödeme Bilgilerini Güncelle
router.put('/profile/payments', authenticateToken, async (req, res) => {
  const { iban, saved_cards } = req.body;
  try {
    const [userRows] = await db.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
    const userEmail = userRows[0].email;
    const [existing] = await db.query('SELECT id FROM user_informations WHERE email = ?', [userEmail]);

    if (existing.length > 0) {
      await db.query('UPDATE user_informations SET iban = ?, saved_cards = ?, updated_at = NOW() WHERE email = ?', [
        iban || null,
        saved_cards || null,
        userEmail
      ]);
    } else {
      await db.query('INSERT INTO user_informations (email, iban, saved_cards) VALUES (?, ?, ?)', [
        userEmail,
        iban || null,
        saved_cards || null
      ]);
    }
    res.json({ message: 'Ödeme bilgileriniz güncellendi.' });
  } catch (err) {
    res.status(500).json({ message: 'Güncelleme hatası.' });
  }
});

module.exports = router;