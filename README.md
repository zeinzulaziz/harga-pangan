# Harga Pangan Indonesia

Dashboard grafik harga bahan pangan Indonesia menampilkan 9 komoditas strategis dari berbagai daerah dengan data real-time.

**Live**: https://zeinzulaziz.github.io/harga-pangan/

---

## Fitur

- **Grafik interaktif** — zoom, pan, drag-to-zoom (chartjs-plugin-zoom)
- **4 periode** — 6 bulan, 1 tahun, 3 tahun, 5 tahun
- **8 daerah** — Nasional, Jatim, Jateng, Jabar, DKI Jakarta, Sumut, Sulsel, Bali
- **Toggle harga** — Harga Konsumen / Harga Produsen
- **9 komoditas** — Bawang Merah, Bawang Putih, Cabai Rawit, Cabai Merah, Beras, Gula Pasir, Minyak Goreng, Daging Ayam, Telur Ayam
- **Data live** — auto-scrape dari SISKAPERBAPO Jatim setiap hari
- **Download PNG** — simpan grafik sebagai gambar
- **Reset zoom** — kembali ke tampilan awal
- **Mobile responsive** — tampilan optimal di semua ukuran layar

---

## Sumber Data

Dashboard menggunakan **multi-source** untuk data yang lebih akurat:

| Sumber | Data | Periode | Update |
|--------|------|---------|--------|
| [Badan Pangan Nasional](https://data.badanpangan.go.id) | Harga rata-rata bulanan nasional | 2021 – Sekarang | Bulanan |
| [SISKAPERBAPO Jatim](https://siskaperbapo.jatimprov.go.id) | Harga live harian Jawa Timur | Hari ini | Setiap hari |
| `data/history/YYYY-MM.json` | Database historis per bulan | Semua data (tanpa batas) | Otomatis |

### Cara Data Digunakan

```
Grafik 5 tahun & 3 tahun
├── Data rata-rata tahunan dari Badan Pangan
└── Tersedia untuk 9 komoditas (2021–sekarang)

Grafik 1 tahun (13 bulan terakhir)
├── 7 bulan awal → Data bulanan Badan Pangan
└── 6 bulan terakhir → Interpolasi linear ke harga live SISKAPERBAPO

Grafik 6 bulan (6 bulan terakhir)
├── Rata-rata bulanan dari data/history/YYYY-MM.json (jika tersedia)
└── Interpolasi linear dari harga bulan pertama ke harga live
```

### Regional Pricing

Harga daerah dihitung menggunakan **multiplier** terhadap harga nasional:

| Daerah | Multiplier | Keterangan |
|--------|-----------|------------|
| Nasional | 1.00 | Baseline |
| Jawa Timur | 0.74 | Lebih murah dari nasional |
| Jawa Tengah | 0.80 | Estimasi |
| Jawa Barat | 0.97 | Mendekati nasional |
| DKI Jakarta | 1.12 | Lebih mahal |
| Sumatera Utara | 1.05 | Sedikit lebih mahal |
| Sulawesi Selatan | 0.95 | Sedikit lebih murah |
| Bali | 0.71 | Paling murah |

---

## Arsitektur Data

```
GitHub Actions (setiap hari jam 14:00 WIB)
│
├── scrape-siskaperbapo.js
│   ├── Fetch HTML dari siskaperbapo.jatimprov.go.id
│   ├── Parse harga konsumen & produsen
│   ├── Simpan → data/siskaperbapo.json (live hari ini)
│   └── Akumulasi → data/history/YYYY-MM.json (database per bulan)
│
└── update timestamp di index.html

Browser (saat user buka website)
│
├── Load index.html
├── Fetch data/siskaperbapo.json (live price)
├── Fetch data/history/YYYY-MM.json (12 bulan terakhir)
├── Apply interpolasi linear (data Badan Pangan → harga live)
├── Apply history data (override interpolasi jika ada data aktual)
└── Render chart dengan Chart.js
```

---

## Struktur File

```
harga-pangan/
├── index.html                    # Dashboard utama (single-file app)
├── data/
│   ├── siskaperbapo.json         # Data live dari SISKAPERBAPO (auto-update)
│   └── history/
│       ├── 2025-07.json          # Database historis Jul 2025
│       ├── ...
│       └── 2026-07.json          # Database historis Jul 2026 (auto-akumulasi)
├── scripts/
│   └── scrape-siskaperbapo.js    # Scraper utama (konsumen + produsen)
├── .github/
│   └── workflows/
│       └── update-prices.yml     # GitHub Actions workflow
├── package.json
└── README.md
```

---

## Tech Stack

- **Chart.js 4.4.7** — chart rendering
- **chartjs-plugin-zoom 2.0.1** — zoom, pan, drag-to-zoom
- **Hammer.js 2.0.8** — touch gesture support
- **Vanilla JavaScript** — tanpa framework
- **Inter Font** — Google Fonts
- **Node.js** — scraper scripts
- **GitHub Actions** — CI/CD otomatis

---

## Setup

### Automatic (Recommended)

Website sudah deployed di GitHub Actions. Data di-update otomatis setiap hari.

Untuk trigger manual:
1. Buka tab **Actions** di repository
2. Pilih workflow **"Update Harga Pangan"**
3. Klik **"Run workflow"**

### Local Development

```bash
# Clone repository
git clone https://github.com/zeinzulaziz/harga-pangan.git
cd harga-pangan

# Install dependencies
npm install

# Jalankan scraper manual
node scripts/scrape-siskaperbapo.js

# Buka index.html di browser
open index.html
```

---

## Data Pipeline

### Scraper (`scripts/scrape-siskaperbapo.js`)

Scraper mengambil data dari dua halaman SISKAPERBAPO:

1. **Konsumen** — `siskaperbapo.jatimprov.go.id/` (GET request)
2. **Produsen** — `siskaperbapo.jatimprov.go.id/produsen/tabel.nodesign/` (POST request)

Output:
- `data/siskaperbapo.json` — data live hari ini
- `data/history/YYYY-MM.json` — database historis per bulan (tanpa batas)

### History Format (`data/history/YYYY-MM.json`)

```json
{
  "month": "2026-07",
  "daily": {
    "2026-07-22": {
      "prices": {
        "Bawang Merah": 32893,
        "Bawang Putih": 32951
      },
      "producerPrices": {
        "Bawang Merah": 20500
      }
    }
  },
  "average": {
    "Bawang Merah": 33100,
    "Bawang Putih": 33200
  },
  "lastUpdate": "2026-07-22T07:00:00.000Z"
}
```

Setiap bulan punya file terpisah. Data akumulasi otomatis setiap hari, tanpa batas waktu.

### Interpolasi Linear

Untuk mengisi gap data (6 bulan terakhir), sistem menggunakan interpolasi linear:

```
Harga bulan awal (Badan Pangan) ──────── Harga hari ini (SISKAPERBAPO live)
         │                                        │
    Harga awal                                 Harga live
         │                                        │
         ├── Bulan ke-2                          │
         ├── Bulan ke-3                          │
         ├── Bulan ke-4                          │
         ├── Bulan ke-5                          │
         └── Bulan ke-6                          │
```

Sistem mencari titik data terakhir yang tersedia dari Badan Pangan, lalu menghubungkannya secara linear dengan harga live dari SISKAPERBAPO.

---

## Komoditas

| # | Komoditas | Warna | Satuan |
|---|-----------|-------|--------|
| 1 | Bawang Merah | Orange | Rp/kg |
| 2 | Bawang Putih | Kuning | Rp/kg |
| 3 | Cabai Rawit | Pink | Rp/kg |
| 4 | Cabai Merah | Merah | Rp/kg |
| 5 | Beras | Biru | Rp/kg |
| 6 | Gula Pasir | Hijau | Rp/kg |
| 7 | Minyak Goreng | Ungu | Rp/kg |
| 8 | Daging Ayam | Cyan | Rp/kg |
| 9 | Telur Ayam | Pink Muda | Rp/kg |

---

## Troubleshooting

### Data tidak update?
- Cek tab **Actions** untuk melihat log error
- Jalankan workflow manual
- Cek apakah SISKAPERBAPO bisa diakses

### Chart tidak muncul?
- Pastikan koneksi internet aktif (untuk load CDN: Chart.js, Hammer.js)
- Clear cache browser

### Harga tidak sesuai?
- Harga nasional dari Badan Pangan mungkin berbeda dengan harga daerah
- Harga live dari SISKAPERBAPO adalah harga Jawa Timur
- Harga produsen bersifat estimasi kecuali tersedia dari SISKAPERBAPO

---

## Lisensi

Dibuat oleh [zeinzulaziz](https://github.com/zeinzulaziz)

Data bersumber dari Badan Pangan Nasional dan SISKAPERBAPO Jawa Timur.
