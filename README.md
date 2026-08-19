# Harga Produsen Pangan Jawa Timur

Dashboard harga produsen pangan Jawa Timur yang mengambil data dari
[SISKAPERBAPO Jatim](https://siskaperbapo.jatimprov.go.id/produsen/tabel).

Project ini menampilkan tren harga harian beberapa komoditas produsen, memilih
pasar, melihat histori sekitar 10 tahun, dan membaca analisa musiman untuk
membantu petani memahami waktu harga tinggi, rendah, dan momentum kenaikan.

## Fitur

- 8 komoditas produsen:
  - Bawang Merah
  - Beras
  - Cabe Rawit
  - Cabe Besar
  - Telur
  - Ayam Potong
  - Daging Sapi
  - Kentang
- Histori harga harian dari sekitar Agustus 2016 sampai sekarang.
- Chart interaktif dengan zoom, pan, dan drag selection.
- Filter periode preset dan rentang tanggal bebas.
- Pemilihan pasar pada sidebar.
- Penanda data aktual dan data estimasi carry-forward.
- Analisa tren berdasarkan median harga historis.
- Rekomendasi bulan dengan harga tertinggi, harga terendah, momentum kenaikan,
  konsistensi pola, dan coverage data.
- Layout desktop dengan sidebar dan toggle sidebar pada mobile.
- Update data otomatis melalui GitHub Actions.

## Sumber Data

Sumber utama adalah halaman grafik produsen SISKAPERBAPO:

```text
https://siskaperbapo.jatimprov.go.id/produsen/grafik
```

Halaman tersebut menyediakan data sekitar 30 hari untuk komoditas dan pasar
tertentu. Scraper mengambil beberapa rentang tanggal, lalu menggabungkannya
menjadi histori harian.

Data yang tidak tersedia dari sumber dapat diisi menggunakan harga valid hari
sebelumnya agar chart tetap berkesinambungan. Nilai tersebut diberi penanda
`imputed` dan tidak digunakan sebagai data aktual utama dalam analisa.

## Struktur Project

```text
harga-pangan/
├── index.html
├── package.json
├── data/
│   ├── produsen.json
│   ├── analisa.json
│   └── history/
│       └── YYYY/
│           └── YYYY-MM/
│               └── YYYY-MM-DD.json
├── scripts/
│   ├── scrape-produsen.js
│   └── analisa-tren.js
└── .github/workflows/main.yml
```

### `data/produsen.json`

File agregat yang dibaca dashboard. Isinya mencakup:

- Nama pasar per komoditas
- Harga harian
- Rentang tanggal
- Jumlah hari data
- Penanda data estimasi

### `data/history/`

Arsip harian yang dikelompokkan berdasarkan tahun dan bulan. File ini menjadi
rekaman historis dan tidak menggantikan file hari sebelumnya.

### `data/analisa.json`

Hasil analisa yang dibuat dari `produsen.json` dan digunakan oleh view
`Analisa` pada dashboard.

## Menjalankan Lokal

Project membutuhkan Node.js. Tidak ada dependency npm tambahan.

```bash
npm run scrape
npm run analisa
```

Karena browser membatasi `fetch` pada file lokal, jalankan static server untuk
membuka dashboard:

```bash
python3 -m http.server 8000
```

Kemudian buka:

```text
http://localhost:8000
```

## Scraper

### Mode Harian

Mode harian mengambil data terbaru, menggabungkannya dengan `produsen.json`,
dan menyimpan arsip ke `data/history/`.

```bash
npm run scrape
```

Mode ini digunakan oleh GitHub Actions.

### Backfill Historis

Mode full mengambil banyak rentang 30 hari untuk membangun histori. Data lama
tetap dipertahankan dan hasil baru di-merge.

```bash
npm run scrape:full
```

Jumlah request dapat diatur melalui `BACKFILL_REQUESTS`:

```bash
BACKFILL_REQUESTS=66 npm run scrape:full
BACKFILL_REQUESTS=131 npm run scrape:full
```

Nilai sekitar 66 request per komoditas mencakup kurang lebih 5 tahun, sedangkan
131 request mencakup kurang lebih 10 tahun dengan interval request 28 hari.

### Analisa

```bash
npm run analisa
```

Analisa menggunakan data aktual yang tersedia. Data carry-forward yang diberi
penanda `imputed` dikecualikan dari perhitungan utama.

Hasil analisa meliputi:

- Median dan rata-rata harga per bulan kalender
- Bulan dengan harga tertinggi
- Bulan dengan harga terendah
- Momentum kenaikan dan penurunan
- Konsistensi arah perubahan antar tahun
- Coverage data dan jumlah hari aktual/estimasi
- Perbandingan tahun berjalan dengan tahun sebelumnya

## GitHub Actions

Workflow berada di `.github/workflows/main.yml` dan berjalan otomatis setiap
hari sekitar pukul 16:00 WIB. Jadwal GitHub Actions menggunakan UTC:

```yaml
cron: '0 9 * * *'
```

Setiap proses harian:

1. Checkout repository.
2. Menjalankan `npm run scrape`.
3. Menjalankan `npm run analisa`.
4. Menyimpan perubahan ke folder `data/`.
5. Commit dan push perubahan.
6. GitHub Pages melakukan deploy ulang.

Workflow memiliki concurrency agar dua proses scraping tidak berjalan bersamaan
dan menggunakan rebase sebelum push untuk mengurangi konflik.

## Catatan Data

- Jadwal GitHub Actions dapat terlambat beberapa menit dari jadwal cron.
- SISKAPERBAPO dapat terlambat mengisi data tanggal terbaru.
- Nama atau jumlah pasar dapat berubah dari waktu ke waktu.
- Data carry-forward hanya digunakan agar chart tidak terputus, bukan sebagai
  bukti harga aktual.
- Rekomendasi adalah analisa historis, bukan jaminan harga masa depan.
- Faktor cuaca, produksi, hari raya, pasokan, biaya produksi, dan permintaan
  belum dimasukkan ke model.

## Teknologi

- HTML, CSS, dan JavaScript vanilla
- Chart.js
- chartjs-plugin-zoom
- Node.js untuk scraper dan analisa
- GitHub Actions untuk otomasi
- GitHub Pages untuk hosting dashboard
