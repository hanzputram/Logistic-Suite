# ATS Logistics Suite

Aplikasi Manajemen Pengiriman, Penjadwalan Rute, Verifikasi Checker Dokumen, & Tagihan terintegrasi langsung dengan **Accurate Online Open API**.

## Fitur Utama

- **Integrasi Accurate Online API**: Sinkronisasi Delivery Order (Surat Jalan), Item SKU, dan Data Master Pelanggan & Gudang.
- **Dynamic Route Optimization & Clustering**: Optimasi rute pengiriman multi-titik berdasarkan rute wilayah/koridor serta penugasan armada motor dan mobil.
- **Checker Verification System (L1 & L2)**: Verifikasi kelengkapan dokumen pengiriman berjenjang dengan tanda tangan digital dan validasi status.
- **Urgent Trip Management**: Penanganan perjalanan darurat dan penugasan armada cadangan.
- **Mobile Responsive & Driver View**: Antarmuka responsif yang memudahkan operasional armada di lapangan.

## Prasyarat

- Node.js v20+ (direkomendasikan v22+)
- SQLite (built-in dengan Node.js `node:sqlite`)

## Instalasi

1. Clone repositori:
   ```bash
   git clone https://github.com/hanzputram/Logistic-Suite.git
   cd Logistic-Suite
   ```

2. Instal dependensi:
   ```bash
   npm install
   ```

3. Konfigurasi Environment:
   Salin file `.env.example` menjadi `.env` dan lengkapi kredensial Accurate Online Anda:
   ```bash
   cp .env.example .env
   ```

4. Jalankan aplikasi:
   ```bash
   # Development mode (watch)
   npm run dev

   # Production mode
   npm start
   ```

Aplikasi dapat diakses melalui browser di `http://localhost:7070`.
