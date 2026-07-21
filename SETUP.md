# Panduan Setup Update Otomatis Harga Pangan

## Langkah 1: Daftar API Key NFA

1. Buka **https://webapi.badanpangan.go.id/register**
2. Isi formulir pendaftaran dengan data yang valid
3. Cek email untuk verifikasi akun
4. Setelah akun disetujui, login dan salin **API Key** dari dashboard

> Proses verifikasi biasanya 1-7 hari kerja

## Langkah 2: Tambahkan Secret di GitHub

1. Buka repository GitHub: **https://github.com/zeinzulaziz/harga-pangan**
2. Klik **Settings** → **Secrets and variables** → **Actions**
3. Klik **New repository secret**
4. Name: `NFA_API_KEY`
5. Value: paste API key dari langkah 1
6. Klik **Add secret**

## Langkah 3: Aktifkan GitHub Actions

GitHub Actions sudah dikonfigurasi untuk:
- Fetch data setiap hari jam **14:00 WIB** (07:00 UTC)
- Update timestamp di website otomatis
- Commit dan push perubahan

Untuk trigger manual:
1. Buka tab **Actions** di repository
2. Pilih workflow **"Update Harga Pangan"**
3. Klik **"Run workflow"**

## Cara Kerja

```
Setiap hari jam 14:00 WIB:
  ↓
GitHub Actions menjalankan fetch-prices.js
  ↓
Fetch data dari API NFA (Badan Pangan)
  ↓
Simpan ke data/prices.json
  ↓
Update timestamp di index.html
  ↓
Commit & push otomatis
  ↓
GitHub Pages update otomatis
```

## Struktur File

```
harga-pangan/
├── index.html              # Halaman utama
├── data/
│   └── prices.json         # Data harga dari API (auto-update)
├── scripts/
│   └── fetch-prices.js     # Script fetch data
└── .github/
    └── workflows/
        └── update-prices.yml  # GitHub Actions workflow
```

## Troubleshooting

### Workflow gagal?
- Cek tab **Actions** untuk melihat log error
- Pastikan `NFA_API_KEY` sudah benar
- Cek apakah API NFA bisa diakses

### Data tidak update?
- Jalankan workflow manual dari tab Actions
- Cek apakah `data/prices.json` ada di branch `master`

### Inya?**
- Buka repository → Settings → Pages
- Pastikan Source: **GitHub Actions**
