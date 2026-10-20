#!/usr/bin/env node

// Pemeriksa read-only: mencari lonjakan/punculan satu hari yang langsung kembali
// normal. Rentang 1,5x-4x sengaja tidak dihapus otomatis oleh bersihkan-data.js
// karena bisa merupakan fluktuasi pasar yang wajar, jadi kandidat di sini harus
// ditinjau manual sebelum masuk ke CORRECTIONS.

const fs = require('fs');
const path = require('path');
const { CORRECTIONS } = require('./bersihkan-data');

const NEIGHBORS = 3;
const LOWER_RATIO = 0.65;
const UPPER_RATIO = 1.5;
const MAX_STABLE_GAP = 0.2;
const LEVEL_RATIO = 3;

const DATA_PATH = path.join(__dirname, '..', 'data', 'produsen.json');
const AS_JSON = process.argv.includes('--json');

function isValidPrice(value) {
  return Number.isFinite(value) && value > 0;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ratioOf(value, center) {
  if (!center) return null;
  return value / center;
}

function rupiah(value) {
  return Number(value).toLocaleString('id-ID');
}

function correctionFor(commodity, column, date) {
  return CORRECTIONS.find((item) => (
    item.commodity === commodity && item.column === column && item.date === date
  ));
}

function detectCommodity(commodity, info) {
  const candidates = [];

  for (let colIndex = 0; colIndex < info.columns.length; colIndex++) {
    const column = info.columns[colIndex];
    const observed = [];

    for (const date of Object.keys(info.prices).sort()) {
      const flags = info.imputed[date] || [];
      const value = info.prices[date][colIndex];
      if (isValidPrice(value) && !flags[colIndex]) observed.push({ date, value });
    }

    for (let k = NEIGHBORS; k < observed.length - NEIGHBORS; k++) {
      const current = observed[k];
      const before = observed.slice(k - NEIGHBORS, k).map((item) => item.value);
      const after = observed.slice(k + 1, k + 1 + NEIGHBORS).map((item) => item.value);
      const beforeMedian = median(before);
      const afterMedian = median(after);
      const neighborsMedian = median(before.concat(after));
      if (!neighborsMedian) continue;

      const ratio = ratioOf(current.value, neighborsMedian);
      if (ratio === null || (ratio <= UPPER_RATIO && ratio >= LOWER_RATIO)) continue;

      const stable = Math.abs(beforeMedian - afterMedian) / afterMedian <= MAX_STABLE_GAP;
      if (!stable) continue;

      const correction = correctionFor(commodity, column, current.date);
      candidates.push({
        commodity,
        column,
        date: current.date,
        value: current.value,
        neighborsMedian,
        beforeMedian,
        afterMedian,
        ratio: Number(ratio.toFixed(2)),
        direction: ratio > 1 ? 'naik' : 'turun',
        status: correction ? 'sudah dikoreksi' : 'baru'
      });
    }
  }

  return candidates;
}

// Nilai aktual terakhir yang melompat >3x dari aktual sebelumnya bisa menjadi
// basis carry-forward berhari-hari, jadi harus ditinjau walau tidak punya
// tetangga aktual untuk dibandingkan.
function detectLatestShift(commodity, info) {
  const candidates = [];

  for (let colIndex = 0; colIndex < info.columns.length; colIndex++) {
    const column = info.columns[colIndex];
    const observed = [];

    for (const date of Object.keys(info.prices).sort()) {
      const flags = info.imputed[date] || [];
      const value = info.prices[date][colIndex];
      if (isValidPrice(value) && !flags[colIndex]) observed.push({ date, value });
    }

    if (observed.length < 2) continue;
    const current = observed[observed.length - 1];
    const previous = observed[observed.length - 2];
    const ratio = current.value / previous.value;
    if (ratio < LEVEL_RATIO && ratio > 1 / LEVEL_RATIO) continue;

    const correction = correctionFor(commodity, column, current.date);
    candidates.push({
      commodity,
      column,
      date: current.date,
      value: current.value,
      neighborsMedian: previous.value,
      ratio: Number(ratio.toFixed(2)),
      direction: ratio > 1 ? 'naik' : 'turun',
      status: correction ? 'sudah dikoreksi' : 'pergeseran level',
      kind: 'level'
    });
  }

  return candidates;
}

function main() {
  if (!fs.existsSync(DATA_PATH)) throw new Error('data/produsen.json tidak ditemukan');
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const candidates = [];

  for (const [commodity, info] of Object.entries(data.commodities)) {
    candidates.push(...detectCommodity(commodity, info), ...detectLatestShift(commodity, info));
  }

  // Pergerakan yang terjadi di beberapa pasar sekaligus biasanya kondisi pasar
  // nyata, bukan salah input, jadi ditandai terpisah.
  const perDate = new Map();
  for (const item of candidates) {
    const key = `${item.commodity}|${item.date}`;
    perDate.set(key, (perDate.get(key) || 0) + 1);
  }
  for (const item of candidates) {
    if (item.status === 'baru' && perDate.get(`${item.commodity}|${item.date}`) > 1) {
      item.status = 'pergerakan pasar';
    }
  }

  candidates.sort((a, b) => (
    a.commodity.localeCompare(b.commodity) ||
    a.column.localeCompare(b.column) ||
    b.date.localeCompare(a.date)
  ));

  if (AS_JSON) {
    console.log(JSON.stringify(candidates, null, 2));
    return;
  }

  const fresh = candidates.filter((item) => item.status === 'baru');
  console.log(`🔍 Memeriksa ${Object.keys(data.commodities).length} komoditas di data/produsen.json`);
  console.log('   Kriteria: spike satu hari >=1,5x / <=0,65x dengan tetangga stabil,');
  console.log('   atau nilai aktual terakhir melompat >=3x dari aktual sebelumnya\n');

  if (candidates.length === 0) {
    console.log('✅ Tidak ada kandidat salah input.');
    return;
  }

  const label = {
    baru: '⚠️ ',
    'sudah dikoreksi': '✔️ ',
    'pergerakan pasar': 'ℹ️ ',
    'pergeseran level': '🚨 '
  };
  const note = {
    baru: '',
    'sudah dikoreksi': ' | sudah ada di CORRECTIONS',
    'pergerakan pasar': ' | beberapa pasar bergerak bersamaan',
    'pergeseran level': ' | nilai aktual terakhir vs aktual sebelumnya'
  };

  let lastCommodity = null;
  for (const item of candidates) {
    if (item.commodity !== lastCommodity) {
      console.log(`\n${item.commodity}`);
      lastCommodity = item.commodity;
    }
    console.log(
      `${label[item.status]}${item.date} | ${item.column} | ${rupiah(item.value)} ` +
      `(${item.direction} ${item.ratio}x dari sekitar ${rupiah(item.neighborsMedian)})` +
      note[item.status]
    );
  }

  const marketWide = candidates.filter((item) => item.status === 'pergerakan pasar').length;
  const levelShift = candidates.filter((item) => item.status === 'pergeseran level').length;
  const corrected = candidates.filter((item) => item.status === 'sudah dikoreksi').length;
  console.log(`\n${fresh.length} kandidat baru, ${levelShift} pergeseran level, ${corrected} sudah dikoreksi, ${marketWide} pergerakan pasar.`);
  console.log('Tinjau nilainya, lalu tambahkan yang terbukti salah ke CORRECTIONS di scripts/bersihkan-data.js.');
  console.log('Gunakan replacement bila nilai benar diketahui; tanpa replacement berarti dihapus dan diisi carry-forward.');
}

if (require.main === module) main();

module.exports = { detectCommodity, isValidPrice, median };
