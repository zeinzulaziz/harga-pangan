#!/usr/bin/env bash
# Harian - scrape data produsen pangan Jawa Timur dari SISKAPERBAPO.
#
# Urutan resmi (lihat AGENTS.md / README.md):
#   scrape -> cek -> bersikken -> analisa -> commit -> push (GitHub Pages)
#
# Jalankan manual:  bash scripts/scrape-harian.sh
# Output log:       ~/Library/Logs/harga-pangan/harian.log
set -u

REPO="/Users/fanaloka/.hermes/profiles/harga-pangan/repo"
LOG_DIR="$HOME/Library/Logs/harga-pangan"
LOG="$LOG_DIR/harian.log"
mkdir -p "$LOG_DIR"

exec >>"$LOG" 2>&1
echo "=================================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] MULAI"

cd "$REPO" || { echo "GAGAL: tidak bisa cd ke $REPO"; exit 1; }

npm run scrape
RC=$?
echo "[$(date '+%F %T')] scrape exit=$RC"
if [ "$RC" -ne 0 ]; then
  echo "[$(date '+%F %T')] SCRAPE GAGAL - berhenti sebelum analisa."
  exit 1
fi

echo "[$(date '+%F %T')] cek (baca-only)..."
npm run cek

echo "[$(date '+%F %T')] bersikken..."
npm run bersihkan

echo "[$(date '+%F %T')] analisa..."
npm run analisa

echo "[$(date '+%F %T')] commit & push..."
git add -A
if git diff --cached --quiet; then
  echo "[$(date '+%F %T')] tidak ada perubahan data hari ini."
else
  git commit -m "ci(data): scrap harian $(date '+%Y-%m-%d')"
  git push origin HEAD:master
  echo "[$(date '+%F %T')] push selesai."
fi

echo "[$(date '+%F %T')] notifikasi Discord..."
if [ -n "${WEBHOOK_DISCORD:-}" ]; then
  node "$REPO/scripts/ringkasan-harian.js" > "${TMPDIR:-/tmp}/ringkasan.json" 2>/dev/null
  if [ -s "${TMPDIR:-/tmp}/ringkasan.json" ]; then
    curl -s -X POST -H "Content-Type: application/json" --data-binary "@${TMPDIR:-/tmp}/ringkasan.json" "$WEBHOOK_DISCORD" >/dev/null 2>&1 \
      && echo "[$(date '+%F %T')] notifikasi Discord terkirim." \
      || echo "[$(date '+%F %T')] notifikasi Discord gagal dikirim."
  else
    echo "[$(date '+%F %T')] ringkasan Discord tidak tersedia (file kosong)."
  fi
else
  echo "[$(date '+%F %T')] notifikasi Discord dilewati — WEBHOOK_DISCORD belum diatur."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] SELESAI"
