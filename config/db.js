const mysql = require('mysql2');
require('dotenv').config();

// TiDB Cloud ve SSL uyumlu veritabanı bağlantı havuzu
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000, // TiDB Cloud varsayılan portu 4000'dir
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false // TiDB Cloud SSL zorunluluğu için şarttır
    }
});

// Sorguları async/await yapısıyla modern bir şekilde kullanabilmek için promise() desteği ekliyoruz
const db = pool.promise();

// Bağlantının başarılı olup olmadığını başlangıçta test edelim
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ TiDB Veritabanı bağlantı hatası:', err.message);
    } else {
        console.log('🚀 TiDB Veritabanına başarıyla bağlanıldı!');
        connection.release(); // Bağlantıyı havuza geri bırakıyoruz
    }
});

module.exports = db;
