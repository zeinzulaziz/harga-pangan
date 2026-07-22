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
| [Badan Pangan Nasional](https://data.badanpangan.go.id) | Harga rata-rata bulanan nasional | 2021 – Jan 2026 | Bulanan |
| [SISKAPERBAPO Jatim](https://siskaperbapo.jatimprov.go.id) | Harga live harian Jawa Timur | Hari ini | Setiap hari |
| `data/history/YYYY.json` | Database historis per tahun | Semua data (tanpa batas) | Otomatis |

### Cara Data Digunakan

```
Grafik 5 tahun & 3 tahun
├── Data rata-rata tahunan dari Badan Pangan
└── Tersedia untuk 9 komoditas (2021–2026)

Grafik 1 tahun (13 bulan: Jul 2025 – Jul 2026)
├── Jul 2025 – Jan 2026 → Data bulanan Badan Pangan
└── Feb – Jul 2026 → Interpolasi dari Jan 2026 ke harga live SISKAPERBAPO

Grafik 6 bulan (Feb – Jul 2026)
├── Rata-rata bulanan dari data/history/YYYY.json (jika tersedia)
└── Interpolasi linear dari harga Jan 2026 ke harga live
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
│   └── Akumulasi → data/history/YYYY.json (database per tahun)
│
└── update timestamp di index.html

Browser (saat user buka website)
│
├── Load index.html
├── Fetch data/siskaperbapo.json (live price)
├── Fetch data/history/2025.json + 2026.json (historical daily)
├── Apply interpolasi linear (Jan 2026 → harga live)
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
│       ├── 2025.json             # Database historis 2025
│       └── 2026.json             # Database historis 2026 (auto-akumulasi)
├── scripts/
│   ├── scrape-siskaperbapo.js    # Scraper utama (konsumen + produsen)
│   ├── fetch-prices.js           # Legacy: fetch dari API Badan Pangan
│   ├── scrape-pihps.js           # Legacy: scrape PIHPS
│   └── update.js                 # Legacy: update script
├── .github/
│   └── workflows/
│       └── update-prices.yml     # GitHub Actions workflow
├── package.json
├── SETUP.md
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
- `data/history/YYYY.json` — database historis per tahun (tanpa batas)

### History Format (`data/history/YYYY.json`)

```json
{
  "year": 2026,
  "lastUpdate": "2026-07-22T07:00:00.000Z",
  "daily": {
    "2026-07-22": {
      "prices": {
        "Bawang Merah": 32893,
        "Bawang Putih": 32951,
        "Cabai Rawit": 38536
      },
      "producerPrices": {
        "Bawang Merah": 20500
      }
    }
  },
  "monthly": {
    "2026-07": {
      "Bawang Merah": 33100,
      "Bawang Putih": 33200
    }
  }
}
```

Setiap tahun punya file terpisah. Data akumulasi otomatis setiap hari, tanpa batas waktu.

### Interpolasi Linear

Untuk mengisi gap data (Feb–Jul 2026), sistem menggunakan interpolasi linear:

```
Harga Jan 2026 (Badan Pangan) ──────── Harga Jul 2026 (SISKAPERBAPO live)
         │                                        │
    Rp42,672                                 Rp35,469
         │                                        │
         ├── Feb: Rp41,449                       │
         ├── Mar: Rp40,226                       │
         ├── Apr: Rp39,003                       │
         ├── Mei: Rp37,781                       │
         └── Jun: Rp36,558                       │
```

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
