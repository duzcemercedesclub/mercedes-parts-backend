const mysql = require('mysql2');
require('dotenv').config();

// Veritabanı bağlantı havuzu (Connection Pool) oluşturuyoruz
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Sorguları async/await yapısıyla modern bir şekilde kullanabilmek için promise() desteği ekliyoruz
const db = pool.promise();

// Bağlantının başarılı olup olmadığını başlangıçta test edelim
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MySQL Veritabanı bağlantı hatası:', err.message);
    } else {
        console.log('🚀 MySQL Veritabanına başarıyla bağlanıldı!');
        connection.release(); // Bağlantıyı havuza geri bırakıyoruz
    }
});

module.exports = db;