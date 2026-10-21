#!/usr/bin/env bash
# Harian harga pangan Jatim — jalankan manual saat laptop dibuka.
# Contoh: laptop tutup semalaman (tidur), buka pagi hari → klik file ini →
# pipeline scrape→cek→bersihkan→analisa→commit→push→notif Discord akan jalan.
#
# Log: $HOME/Library/Logs/harga-pangan/manual-run.log

cd "$(dirname "$0")" || exit 1
LOG="$HOME/Library/Logs/harga-pangan/manual-run.log"

{
  echo "========================================"
  echo "Manual run $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "========================================"
  bash scripts/scrape-harian.sh
  RC=$?
  echo "SELESAI (rc=$RC) — lihat detail: $LOG"
  exit $RC
} >> "$LOG" 2>&1
