const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// 1. KULLANICI KAYIT ENDPOINT'I
router.post('/register', async (req, res) => {
    const { 
        name, 
        surname, 
        email, 
        phone_code, 
        phone, 
        password, 
        gender, 
        is_terms_accepted, 
        is_marketing_accepted 
    } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Lütfen zorunlu alanları doldurun.' });
    }

    if (!is_terms_accepted) {
        return res.status(400).json({ message: 'Üyelik Sözleşmesini kabul etmelisiniz.' });
    }

    // Şifre Karmaşıklık Kontrolü (8-15 Karakter, Min 1 Rakam, Min 1 Büyük ve 1 Küçük Harf)
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,15}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: 'Şifreniz belirtilen kurallara uymamaktadır.' });
    }

    try {
        // E-posta kontrolü
        const [existingEmail] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.status(400).json({ message: 'Bu e-posta adresi zaten kayıtlı.' });
        }

        // Telefon numarası girilmişse telefon kontrolü
        if (phone) {
            const [existingPhone] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
            if (existingPhone.length > 0) {
                return res.status(400).json({ message: 'Bu telefon numarası zaten kayıtlı.' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = `
            INSERT INTO users 
            (name, surname, email, phone_code, phone, password, gender, role, is_marketing_accepted) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.query(sql, [
            name, 
            surname || null, 
            email, 
            phone_code || '+90', 
            phone || null, 
            hashedPassword, 
            gender || 'unspecified', 
            'user', 
            is_marketing_accepted ? 1 : 0
        ]);

        res.status(201).json({ 
            message: 'Kullanıcı kaydı başarıyla oluşturuldu.',
            userId: result.insertId 
        });

    } catch (error) {
        console.error('Kayıt hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, kayıt yapılamadı.' });
    }
});

// 2. KULLANICI GİRİŞ ENDPOINT'I (E-posta veya Telefon Numarası İle)
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: 'Lütfen e-posta / telefon ve şifrenizi girin.' });
    }

    try {
        // Hem e-posta hem de telefon kolonunda ara
        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ? OR phone = ?', 
            [identifier, identifier]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Geçersiz e-posta / telefon veya şifre.' });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Geçersiz e-posta / telefon veya şifre.' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET || 'secretkey',
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: 'Giriş başarılı!',
            token,
            user: {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Giriş hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, giriş yapılamadı.' });
    }
});

module.exports = router;