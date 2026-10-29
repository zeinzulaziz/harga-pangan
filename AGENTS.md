# AGENTS.md — Harga Pangan Jatim

Dashboard statis harga produsen pangan Jawa Timur (sumber: SISKAPERBAPO) plus
pipeline data Node.js tanpa dependency. UI dan komentar memakai Bahasa Indonesia.
Detail lengkap ada di `README.md`.

## Peta Cepat
| Kalau mengerjakan | Baca/edit |
|---|---|
| Dashboard & chart | `index.html` (Chart.js, `COLORS`, `isDark`) |
| Analisa musiman | `analisa.html`, `data/analisa.json` |
| Kalkulator tanam | `tanam.html` (objek `CROPS`) |
| Kartu insight bulanan | `kartu.html` |
| Tentang & metode | `tentang.html` |
| Tema, token, tipografi | `assets/site.css`, `assets/theme.js` |
| Pipeline data | `scripts/scrape-harian.sh` → `cek-anomali.js` → `bersihkan-data.js` (`CORRECTIONS`) → `analisa-tren.js` |
| Arsip harian | `data/history/YYYY/YYYY-MM/` |
| Sitemap, OG, favicon | `sitemap.xml`, `og-image.svg`, `favicon.svg` (PNG/ICO hasil generate) |
| Deploy | push `master` (GitHub Pages); scrape otomatis Senin 10:00 WIB via launchd |

Urutan update data: **scrape → cek → bersihkan → analisa**.

## Perintah

```bash
npm run scrape          # data terbaru dari SISKAPERBAPO -> data/produsen.json + arsip history/
npm run scrape:full     # backfill historis (default 52 request x 28 hari; atur BACKFILL_REQUESTS)
npm run cek             # laporan kandidat salah input (read-only)
npm run bersihkan       # hapus outlier + terapkan koreksi manual di scripts/bersihkan-data.js
npm run analisa         # hitung ulang data/analisa.json
python3 -m http.server  # preview lokal; fetch ke data/*.json tidak jalan via file://
```

Urutan update resmi: **scrape → cek → bersihkan → analisa**. `cek` hanya membaca
data dan menampilkan kandidat salah input; `bersihkan` wajib setelah `scrape`
karena scrape bisa menimpa nilai yang sudah dikoreksi.

Tidak ada dependency npm. Jangan tambah library, ubah `package.json`, atau ganti
sumber data tanpa konfirmasi user.

## Arsitektur

- `index.html` — dashboard utama (vanilla JS; Chart.js, hammerjs, chartjs-plugin-zoom
  dari jsdelivr). Membaca `data/produsen.json`. Pasar dipilih lewat tabel pasar di
  bawah grafik; checkbox diikat lewat **indeks** kolom `commodities[nama].columns`.
- `analisa.html` — halaman "Analisa musiman" terpisah (dulu tab di index). Membaca
  `data/analisa.json` saja; CSS + JS analisa (heatmap, peta musiman, ringkasan)
  pindah dari `index.html` ke halaman ini.
- `assets/site.css` — fondasi tampilan bersama (token warna, tipografi, header,
  footer, tombol). Dipakai `index.html`, `analisa.html`, `tanam.html`,
  `tentang.html`, dan `kartu.html`; halaman 404 memakai salinan token inline agar
  tetap tampil saat
  URL yang diminta tidak ada.
- `assets/theme.js` — mode gelap: dijalankan blocking di `<head>` semua halaman
  (set `data-theme` dari localStorage `theme` atau preferensi sistem sebelum
  paint pertama), lalu memasang tombol `[data-theme-toggle]` di header dan
  menyiarkan event `themechange` untuk render ulang chart/diagram.
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
- Nilai aktual yang tidak punya tetangga aktual (mis. setelah sumber lama kosong)
  tidak terdeteksi aturan median dan bisa menjadi basis carry-forward berhari-hari.
  `npm run cek` menandainya sebagai "pergeseran level" (lompatan >=3x dari aktual
  sebelumnya); periksa bagian itu sebelum memperbarui data.
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
- Mode gelap memakai dua jalur di `assets/site.css`: `:root[data-theme="dark"]`
  (JavaScript aktif) dan `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }`
  (tanpa JavaScript). Warna chart/titik dihitung dari `isDark()`/`chartColors`/
  `seriesColor` — jangan tambah hex hardcoded baru. Sel heatmap analisa sengaja
  dipatok teks `#172B24` karena latar sel selalu pastel di kedua mode.
- `--accent` dinaikkan terangnya di mode gelap untuk teks/ikon; latar solid
  berlabel putih (tombol primer, `.brand-mark`, `.skip-link`) wajib memakai
  `--accent-solid` yang tetap hijau pekat agar kontras teks terpenuhi.

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
Scrape dijalankan otomatis setiap Senin 10:00 WIB via launchd (`com.zeinzulaziz.harga-pangan.scrape`); bisa juga dijalankan manual dari mesin lokal. Tidak ada GitHub Actions atau workflow terjadwal yang memperbarui data.

## Konvensi

- Vanilla HTML/CSS/JS. Tanpa framework, bundler, atau build step.
- Tanggal dan angka diformat ke `id-ID`.
- Palet terang: bg `#F7F8FA`, surface `#FFFFFF`, garis `#E5E9E6`, teks `#172B24`,
  sekunder `#5F6C66`, aksen hijau `#246B4A` (brand), naik `#C2413B`, turun
  `#16805D`, warna seri chart di array `COLORS` (`index.html`). Token lengkap
  ada di `assets/site.css`; jangan menulis ulang nilai warna di halaman.
  Mode gelap memakai token `--dk-*` di `site.css`; pratinjau/ekspor PNG
  (`exportPng`, kanvas kartu insight) mengikuti tema aktif kecuali dinyatakan
  sebaliknya.
- Harga disimpan sebagai rupiah per kg (integer).
- Script Node gaya CommonJS, diawali `#!/usr/bin/env node`, output console
  berbahasa Indonesia dengan emoji status.
