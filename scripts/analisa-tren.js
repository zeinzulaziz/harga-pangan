#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const BULAN_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function load() {
  const p = path.join(__dirname, '..', 'data', 'produsen.json');
  if (!fs.existsSync(p)) { console.log('❌ data/produsen.json tidak ada'); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function avg(arr) {
  const v = arr.filter(x => x != null && x > 0);
  return v.length > 0 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function analyze(data) {
  const result = {};

  for (const [commodity, info] of Object.entries(data.commodities)) {
    const prices = info.prices;
    const dates = Object.keys(prices).sort();

    // Kelompokkan per tahun-bulan
    const monthly = {};
    for (const d of dates) {
      const ym = d.slice(0, 7);
      if (!monthly[ym]) monthly[ym] = [];
      const vals = prices[d].filter(v => v != null && v > 0);
      if (vals.length > 0) monthly[ym].push(avg(vals));
    }

    // Hitung rata-rata per bulan (1-12) across semua tahun
    const bulanAvg = {};
    const bulanCount = {};
    for (let b = 1; b <= 12; b++) {
      bulanAvg[b] = [];
      bulanCount[b] = 0;
    }

    for (const [ym, vals] of Object.entries(monthly)) {
      const b = parseInt(ym.slice(5, 7));
      const a = avg(vals);
      if (a != null) {
        bulanAvg[b].push(a);
        bulanCount[b]++;
      }
    }

    const rataRata = {};
    for (let b = 1; b <= 12; b++) {
      rataRata[b] = bulanAvg[b].length > 0 ? Math.round(avg(bulanAvg[b])) : null;
    }

    // Hitung perubahan bulan-ke-bulan (%)
    const perubahan = {};
    for (let b = 1; b <= 12; b++) {
      const prev = b === 1 ? 12 : b - 1;
      if (rataRata[b] != null && rataRata[prev] != null) {
        perubahan[b] = ((rataRata[b] - rataRata[prev]) / rataRata[prev] * 100).toFixed(1);
      }
    }

    // Identifikasi tren naik dan turun
    const bulanNaik = [];
    const bulanTurun = [];
    for (let b = 1; b <= 12; b++) {
      if (perubahan[b] != null) {
        if (parseFloat(perubahan[b]) > 2) bulanNaik.push({ bulan: b, pct: parseFloat(perubahan[b]) });
        if (parseFloat(perubahan[b]) < -2) bulanTurun.push({ bulan: b, pct: parseFloat(perubahan[b]) });
      }
    }

    bulanNaik.sort((a, b) => b.pct - a.pct);
    bulanTurun.sort((a, b) => a.pct - b.pct);

    // Harga terendah dan tertinggi (bulan)
    const semuaHarga = Object.entries(rataRata).filter(([, v]) => v != null);
    const terendah = semuaHarga.reduce((a, b) => b[1] < a[1] ? b : a);
    const tertinggi = semuaHarga.reduce((a, b) => b[1] > a[1] ? b : a);

    // Data tahun berjalan vs tahun lalu
    const tahunSekarang = {};
    const tahunLalu = {};
    for (const [ym, vals] of Object.entries(monthly)) {
      const y = parseInt(ym.slice(0, 4));
      const b = parseInt(ym.slice(5, 7));
      const a = avg(vals);
      if (a == null) continue;
      const maxY = Math.max(...Object.keys(monthly).map(k => parseInt(k.slice(0, 4))));
      if (y === maxY) tahunSekarang[b] = a;
      if (y === maxY - 1) tahunLalu[b] = a;
    }

    // YoY per bulan
    const yoy = {};
    for (let b = 1; b <= 12; b++) {
      if (tahunSekarang[b] && tahunLalu[b]) {
        yoy[b] = ((tahunSekarang[b] - tahunLalu[b]) / tahunLalu[b] * 100).toFixed(1);
      }
    }

    result[commodity] = {
      columns: info.columns,
      dataDays: dates.length,
      rataRata,
      perubahan,
      bulanNaik,
      bulanTurun,
      terendah: { bulan: parseInt(terendah[0]), harga: terendah[1] },
      tertinggi: { bulan: parseInt(tertinggi[0]), harga: tertinggi[1] },
      yoy
    };
  }

  return result;
}

function printAnalysis(analysis) {
  console.log('\n' + '═'.repeat(60));
  console.log('  📊 ANALISA TREN HARGA PRODUSEN — SISKAPERBAPO JATIM');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(60));

  for (const [commodity, info] of Object.entries(analysis)) {
    console.log('\n' + '─'.repeat(60));
    console.log(`  🧅 ${commodity.toUpperCase()}`);
    console.log(`  📍 ${info.columns.join(' vs ')}`);
    console.log(`  📈 ${info.dataDays} hari data`);
    console.log('─'.repeat(60));

    // Tabel rata-rata bulanan
    console.log('\n  📋 Rata-rata Harga per Bulan (Rp/kg):');
    console.log('  ┌──────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('  │      │    Jan   │    Feb   │    Mar   │    Apr   │    Mei   │    Jun   │    Jul   │    Ags   │    Sep   │    Okt   │    Nov   │    Des   │');
    console.log('  ├──────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

    let hargaRow = '  │ Harga│';
    for (let b = 1; b <= 12; b++) {
      const v = info.rataRata[b];
      hargaRow += v != null ? ` ${v.toLocaleString('id-ID').padStart(8)} │` : '        - │';
    }
    console.log(hargaRow);

    let pctRow = '  │  (%) │';
    for (let b = 1; b <= 12; b++) {
      const v = info.perubahan[b];
      if (v != null) {
        const sign = parseFloat(v) > 0 ? '+' : '';
        const color = parseFloat(v) > 0 ? '🔴' : parseFloat(v) < 0 ? '🟢' : '⚪';
        pctRow += `${color}${sign}${v}`.padStart(8) + ' │';
      } else {
        pctRow += '        - │';
      }
    }
    console.log(pctRow);

    console.log('  └──────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');

    // Tren kenaikan
    if (info.bulanNaik.length > 0) {
      console.log('\n  📈 BULAN DENGAN TREN KENAIKAN:');
      for (const { bulan, pct } of info.bulanNaik) {
        console.log(`    🔴 ${BULAN_FULL[bulan - 1]}: +${pct}% (dari bulan sebelumnya)`);
      }
    }

    // Tren penurunan
    if (info.bulanTurun.length > 0) {
      console.log('\n  📉 BULAN DENGAN TREN PENURUNAN:');
      for (const { bulan, pct } of info.bulanTurun) {
        console.log(`    🟢 ${BULAN_FULL[bulan - 1]}: ${pct}% (dari bulan sebelumnya)`);
      }
    }

    // Rekomendasi
    console.log('\n  💡 REKOMENDASI UNTUK PETANI:');
    if (info.bulanNaik.length > 0) {
      const best = info.bulanNaik[0];
      console.log(`    ✅ Waktu TERBAIK jual: ${BULAN_FULL[best.bulan - 1]} (harga naik +${best.pct}%)`);
    }
    if (info.bulanTurun.length > 0) {
      const worst = info.bulanTurun[info.bulanTurun.length - 1];
      console.log(`    ⚠️  Waktu HINDARI jual: ${BULAN_FULL[worst.bulan - 1]} (harga turun ${worst.pct}%)`);
    }
    console.log(`    📊 Harga TERENDAH biasanya: ${BULAN_FULL[info.terendah.bulan - 1]} (Rp${info.terendah.harga.toLocaleString('id-ID')})`);
    console.log(`    📊 Harga TERTINGGI biasanya: ${BULAN_FULL[info.tertinggi.bulan - 1]} (Rp${info.tertinggi.harga.toLocaleString('id-ID')})`);

    const selisih = info.tertinggi.harga - info.terendah.harga;
    const selisihPct = ((selisih / info.terendah.harga) * 100).toFixed(1);
    console.log(`    💰 Selisih harga: Rp${selisih.toLocaleString('id-ID')} (${selisihPct}%)`);

    // YoY
    const yoyEntries = Object.entries(info.yoy);
    if (yoyEntries.length > 0) {
      console.log('\n  📊 PERBANDINGAN TAHUN INI vs TAHUN LALU:');
      for (const [b, pct] of yoyEntries) {
        const sign = parseFloat(pct) > 0 ? '+' : '';
        const icon = parseFloat(pct) > 5 ? '🔴' : parseFloat(pct) < -5 ? '🟢' : '⚪';
        console.log(`    ${icon} ${BULAN_FULL[parseInt(b) - 1]}: ${sign}${pct}%`);
      }
    }
  }

  // Ringkasan keseluruhan
  console.log('\n' + '═'.repeat(60));
  console.log('  📝 RINGKASAN ANALISA');
  console.log('═'.repeat(60));

  for (const [commodity, info] of Object.entries(analysis)) {
    const bestMonth = info.bulanNaik.length > 0 ? BULAN_FULL[info.bulanNaik[0].bulan - 1] : '-';
    const worstMonth = info.bulanTurun.length > 0 ? BULAN_FULL[info.bulanTurun[info.bulanTurun.length - 1].bulan - 1] : '-';
    console.log(`  ${commodity.padEnd(15)} → Jual terbaik: ${bestMonth.padEnd(10)} | Hindari: ${worstMonth}`);
  }

  console.log('\n  ℹ️  Catatan:');
  console.log('  - Data berdasarkan rata-rata historis dari SISKAPERBAPO');
  console.log('  - Tren bisa berubah tergantung kondisi pasar, cuaca, dll');
  console.log('  - Gunakan sebagai referensi, bukan patokan mutlak');
  console.log('');
}

const data = load();
const analysis = analyze(data);

// Output JSON untuk dashboard
const outDir = path.join(__dirname, '..', 'data');
const outPath = path.join(outDir, 'analisa.json');

const output = {
  generatedAt: new Date().toISOString(),
  summary: {},
  commodities: analysis
};

for (const [commodity, info] of Object.entries(analysis)) {
  const bestMonth = info.bulanNaik.length > 0 ? info.bulanNaik[0].bulan : null;
  const worstMonth = info.bulanTurun.length > 0 ? info.bulanTurun[info.bulanTurun.length - 1].bulan : null;
  output.summary[commodity] = {
    bestMonth,
    worstMonth,
    terendah: info.terendah,
    tertinggi: info.tertinggi
  };
}

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`✅ Analisa tersimpan di data/analisa.json`);
console.log(`\nRingkasan:`);
for (const [commodity, info] of Object.entries(analysis)) {
  const best = info.bulanNaik.length > 0 ? BULAN_FULL[info.bulanNaik[0].bulan - 1] : '-';
  const worst = info.bulanTurun.length > 0 ? BULAN_FULL[info.bulanTurun[info.bulanTurun.length - 1].bulan - 1] : '-';
  console.log(`  ${commodity.padEnd(15)} → Jual: ${best.padEnd(10)} | Hindari: ${worst}`);
}
