# AGENTS.md — Harga Pangan Jatim

Dashboard statis harga produsen pangan Jawa Timur (sumber: SISKAPERBAPO) plus
pipeline data Node.js tanpa dependency. UI dan komentar memakai Bahasa Indonesia.
Detail lengkap ada di `README.md`.

## Perintah

```bash
npm run scrape          # data terbaru dari SISKAPERBAPO -> data/produsen.json + arsip history/
npm run scrape:full     # backfill historis (default 52 request x 28 hari; atur BACKFILL_REQUESTS)
npm run bersihkan       # hapus outlier + terapkan koreksi manual di scripts/bersihkan-data.js
npm run analisa         # hitung ulang data/analisa.json
python3 -m http.server  # preview lokal; fetch ke data/*.json tidak jalan via file://
```

Urutan update resmi: **scrape → bersihkan → analisa**. `bersihkan` wajib setelah
`scrape` karena scrape bisa menimpa nilai yang sudah dikoreksi.

Tidak ada dependency npm. Jangan tambah library, ubah `package.json`, atau ganti
sumber data tanpa konfirmasi user.

## Arsitektur

- `index.html` — dashboard utama (vanilla JS; Chart.js, hammerjs, chartjs-plugin-zoom
  dari jsdelivr). Membaca `data/produsen.json` dan `data/analisa.json`. Pasar di
  sidebar diikat lewat **indeks** kolom `commodities[nama].columns`.
- `tanam.html` — kalkulator waktu tanam; membaca `data/analisa.json`. Daftar
  komoditas + umur panen di-hardcode di objek `CROPS` — kalau scraper menambah
  komoditas baru, update juga di sini.
- `tentang.html` — halaman statis "Tentang & Metode": sumber data, pengolahan,
  batasan. Angka fakta (jumlah komoditas/titik/hari) dihitung dari
  `data/produsen.json` saat dibuka, bukan ditulis manual.
- `kartu.html` — generator Kartu Insight Bulanan: menggambar kartu 1080×1080 di
  canvas dari `data/produsen.json` + teks WhatsApp siap salin. `noindex` dan
  tidak ada di sitemap. Pertahankan aturan "data berhenti" (aktual terakhir >45
  hari) agar harga basi tidak tampil seolah harga terkini.
- `404.html` — halaman 404 GitHub Pages, pakai base URL absolut yang sama dengan
  canonical.
- `data/produsen.json` — agregat utama:
  `{source, type, lastUpdate, commodities: {nama: {columns[], prices{tanggal: [harga
  per kolom]}, imputed{tanggal: [bool]}, days, dateRange}}}`.
- `data/analisa.json` — `{generatedAt, summary, commodities}`; berisi
  `medianByMonth`, `tertinggi`, `terendah`, `recommendation`, dll.
- `data/history/YYYY/YYYY-MM/YYYY-MM-DD.json` — arsip harian; satu file memuat
  semua komoditas pada tanggal itu.

## Gotchas

- `imputed` menandai harga carry-forward (isian dari hari sebelumnya), bukan data
  aktual. Analisa mengecualikannya — jangan tampilkan sebagai data aktual.
- Outlier dihapus `bersihkan-data.js` lewat median tetangga (7 hari, rasio 4x/0.25x).
  Salah input yang lolos threshold ditangani lewat array `CORRECTIONS`; koreksi
  hanya jalan bila nilai saat ini persis sama dengan `value`.
- Urutan `columns` berasal dari sumber dan bisa berubah; indeks harga selalu
  sejajar dengan posisi di array `columns` yang sama.
- Tanggal dihitung memakai timezone `Asia/Jakarta` (`formatDate` di scraper).
- SISKAPERBAPO kadang belum mengisi data hari terbaru; merge parsial itu normal.
- `produsen.json` ditulis minified, `analisa.json` pretty-print. Ikuti format
  masing-masing, jangan reformat manual.
- Data JSON ikut di-commit ke repo (dashboard statis membacanya langsung).
- Tinggi chart `index.html`: `#priceChart` dibungkus `.chart-box` (flex,
  `position: relative`) di dalam `.chart-area`. Jangan kembalikan canvas sebagai
  anak langsung `.chart-area` — Chart.js akan memakai tinggi penuh container dan
  bagian bawah chart terpotong. Di layar pendek `.chart-area` menggulir dan
  `.chart-sticky` (chart-bar + kartu harga) menempel di atas.
- Kentang tidak punya harga aktual sejak 2 Jan 2023 (semua carry-forward panjang).
  Permukaan tampilan (stat card, kartu, tombol bagikan) harus menandai "berhenti
  Jan 2023" alih-alih menyajikannya sebagai harga terkini.

## Metadata & Aset Situs

- `favicon.svg` dan `og-image.svg` adalah sumber; PNG/ICO di root (`favicon.ico`,
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png`)
  dihasilkan darinya — jangan edit file hasil generate.
- `canonical`, `og:url`, `og:image`, `robots.txt`, `sitemap.xml`, dan `404.html`
  memakai base URL `https://zeinzulaziz.github.io/harga-pangan/` (situs berjalan
  di GitHub Pages tanpa domain custom). Ganti semua referensi sekaligus bila
  pindah domain.
- Screenshot README ada di `assets/`; perbarui bila tampilan berubah.
- Lisensi kode: MIT (`LICENSE`). Data harga milik SISKAPERBAPO Pemprov Jawa
  Timur; dashboard bukan kanal resmi.

## Deployment

GitHub Pages dari branch `master` folder root. Push ke `master` = live.

## Konvensi

- Vanilla HTML/CSS/JS. Tanpa framework, bundler, atau build step.
- Tanggal dan angka diformat ke `id-ID`.
- Palet: bg `#0f172a`, surface `#1e293b`, garis `#334155`, teks `#f1f5f9` /
  `#94a3b8`, aksen hijau `#34d399` (brand), warna seri chart di array `COLORS`
  (`index.html`).
- Harga disimpan sebagai rupiah per kg (integer).
- Script Node gaya CommonJS, diawali `#!/usr/bin/env node`, output console
  berbahasa Indonesia dengan emoji status.
