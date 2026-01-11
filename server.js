const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// --- KONFIGURASI SERVER ---

// 1. Sajikan file statis (HTML, CSS, JS, JSON) dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// 2. Jalankan Server
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Server Sistem Peringatan Dini Berjalan!`);
    console.log(`🌍 Buka di browser: http://localhost:${PORT}`);
    console.log(`==================================================`);
});