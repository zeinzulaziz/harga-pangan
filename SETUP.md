# Panduan Setup

## Cara Kerja

Sistem sudah **otomatis** — tidak perlu setup manual.

```
GitHub Actions (setiap hari jam 14:00 WIB)
  ↓
Scrape SISKAPERBAPO Jatim
  ↓
Simpan ke data/siskaperbapo.json + data/history/YYYY.json
  ↓
Update timestamp di index.html
  ↓
Commit & push otomatis
  ↓
GitHub Pages update otomatis
```

## Trigger Manual

1. Buka tab **Actions** di repository
2. Pilih workflow **"Update Harga Pangan"**
3. Klik **"Run workflow"**

## Local Development

```bash
# Clone
git clone https://github.com/zeinzulaziz/harga-pangan.git
cd harga-pangan

# Install dependencies
npm install

# Jalankan scraper manual
node scripts/scrape-siskaperbapo.js

# Buka di browser
open index.html
```

## Troubleshooting

### Workflow gagal?
- Cek tab **Actions** untuk melihat log error
- SISKAPERBAPO kadang tidak bisa diakses (523 error) — coba lagi nanti

### Data tidak update?
- Jalankan workflow manual dari tab Actions
- Cek apakah `data/siskaperbapo.json` ada di branch `master`

### Website tidak bisa diakses?
- Buka repository → Settings → Pages
- Pastikan Source: **GitHub Actions**
