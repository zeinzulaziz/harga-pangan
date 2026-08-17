#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const COMMODITIES = [
  'Bawang Merah', 'Beras', 'Cabe Rawit', 'Cabe Besar',
  'Telur', 'Ayam Potong', 'Daging Sapi', 'Kentang'
];

const FULL_MODE = process.argv.includes('--full');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseGrafikJson(html) {
  try {
    const colsMatch = html.match(/"cols":\[(.*?)\]/);
    let columns = [];
    if (colsMatch) {
      const colRegex = /"label":"([^"]+)"/g;
      let cm;
      while ((cm = colRegex.exec(colsMatch[1])) !== null) {
        columns.push(cm[1]);
      }
    }

    const start = html.indexOf('"rows"');
    if (start === -1) return { columns: [], rows: {} };
    const rowsStart = html.indexOf('[', start);
    let depth = 0, rowsEnd = rowsStart;
    for (let i = rowsStart; i < html.length; i++) {
      if (html[i] === '[') depth++;
      if (html[i] === ']') depth--;
      if (depth === 0) { rowsEnd = i + 1; break; }
    }
    let rowsStr = html.substring(rowsStart, rowsEnd);
    rowsStr = rowsStr.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
    const rows = JSON.parse(rowsStr);

    const result = {};
    for (const row of rows) {
      if (!row.c || row.c.length < 2) continue;
      const date = row.c[0].v;
      if (!date) continue;
      const prices = [];
      for (let i = 1; i < row.c.length; i++) {
        prices.push(row.c[i].v);
      }
      result[date] = prices;
    }
    return { columns: columns.slice(1), rows: result };
  } catch (e) {
    return { columns: [], rows: {} };
  }
}

function formatDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function loadExistingData(outDir) {
  const filePath = path.join(outDir, 'produsen.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.log('⚠ Gagal load data lama, akan buat baru');
    }
  }
  return null;
}

function saveHistoryFiles(outDir, commodity, columns, rows) {
  const historyDir = path.join(outDir, 'history');
  let saved = 0;

  for (const [date, prices] of Object.entries(rows)) {
    const year = date.slice(0, 4);
    const month = date.slice(0, 7);
    const monthDir = path.join(historyDir, year, month);
    if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

    const filePath = path.join(monthDir, `${date}.json`);
    let dayData = {};
    if (fs.existsSync(filePath)) {
      try { dayData = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (e) {}
    }

    if (!dayData.date) dayData.date = date;
    if (!dayData.source) dayData.source = 'SISKAPERBAPO Jatim';
    if (!dayData.type) dayData.type = 'produsen';

    dayData[commodity] = {};
    for (let i = 0; i < columns.length; i++) {
      if (prices[i] != null) {
        dayData[commodity][columns[i]] = prices[i];
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(dayData, null, 2));
    saved++;
  }
  return saved;
}

async function main() {
  const now = new Date();
  const todayStr = formatDate(now);
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const existing = loadExistingData(outDir);

  if (FULL_MODE) {
    console.log('\n' + '═'.repeat(50));
    console.log('  📊 FULL SCRAPE — 2 TAHUN DATA PRODUSEN');
    console.log('  📅 ' + now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
    console.log('═'.repeat(50));

    const grafikData = {};

    for (const commodity of COMMODITIES) {
      console.log(`\n🧅 ${commodity}:`);
      let allColumns = [];
      const allRows = {};

      for (let i = 0; i < 52; i++) {
        const endDate = addDays(now, -i * 28);
        const tanggal = formatDate(endDate);
        process.stdout.write(`  ${tanggal}...`);

        const url = `https://siskaperbapo.jatimprov.go.id/produsen/grafik?tanggal=${tanggal}&bhnpokok=${encodeURIComponent(commodity)}`;
        try {
          const html = await fetchUrl(url);
          const { columns, rows } = parseGrafikJson(html);
          if (columns.length > allColumns.length) allColumns = columns;
          Object.assign(allRows, rows);
          console.log(` ${Object.keys(rows).length} hari`);
        } catch (err) {
          console.log(` gagal`);
        }
        await new Promise(r => setTimeout(r, 300));
      }

      console.log(`  ✓ Total: ${Object.keys(allRows).length} hari`);
      grafikData[commodity] = { columns: allColumns, rows: allRows };
    }

    const output = {
      source: 'SISKAPERBAPO Jatim',
      type: 'produsen',
      lastUpdate: now.toISOString(),
      commodities: {}
    };

    for (const commodity of COMMODITIES) {
      const d = grafikData[commodity];
      const dates = Object.keys(d.rows).sort();
      if (dates.length === 0) continue;
      output.commodities[commodity] = {
        columns: d.columns,
        days: dates.length,
        dateRange: { from: dates[0], to: dates[dates.length - 1] },
        prices: d.rows
      };
      saveHistoryFiles(outDir, commodity, d.columns, d.rows);
    }

    fs.writeFileSync(path.join(outDir, 'produsen.json'), JSON.stringify(output));
    const size = (JSON.stringify(output).length / 1024).toFixed(0);
    console.log(`\n✅ produsen.json tersimpan (${size} KB)`);
    console.log('✅ Selesai!');
    return;
  }

  // MODE HARIAN: scrape hari ini saja, merge ke data lama
  console.log('\n' + '═'.repeat(50));
  console.log('  📊 DAILY SCRAPE — UPDATE HARIAN PRODUSEN');
  console.log('  📅 ' + now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));

  if (!existing) {
    console.log('\n⚠ Data lama tidak ditemukan. Jalankan: npm run scrape -- --full');
    console.log('  untuk ambil data 2 tahun terlebih dahulu.');
    process.exit(1);
  }

  let totalNew = 0;

  for (const commodity of COMMODITIES) {
    process.stdout.write(`\n🧅 ${commodity}: `);

    const url = `https://siskaperbapo.jatimprov.go.id/produsen/grafik?tanggal=${todayStr}&bhnpokok=${encodeURIComponent(commodity)}`;
    try {
      const html = await fetchUrl(url);
      const { columns, rows } = parseGrafikJson(html);
      const newDates = Object.keys(rows);

      if (newDates.length === 0) {
        console.log('tidak ada data baru');
        continue;
      }

      if (!existing.commodities[commodity]) {
        existing.commodities[commodity] = { columns: columns, days: 0, dateRange: {}, prices: {} };
      }

      const existingData = existing.commodities[commodity];
      if (columns.length > (existingData.columns || []).length) {
        existingData.columns = columns;
      }

      let added = 0;
      for (const date of newDates) {
        if (!existingData.prices[date]) {
          existingData.prices[date] = rows[date];
          added++;
        } else {
          existingData.prices[date] = rows[date];
        }
      }

      const allDates = Object.keys(existingData.prices).sort();
      existingData.days = allDates.length;
      existingData.dateRange = { from: allDates[0], to: allDates[allDates.length - 1] };

      saveHistoryFiles(outDir, commodity, existingData.columns, rows);

      console.log(`${added} baru, ${newDates.length} total dari grafik`);
      totalNew += added;
    } catch (err) {
      console.log(`gagal: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  existing.lastUpdate = now.toISOString();
  fs.writeFileSync(path.join(outDir, 'produsen.json'), JSON.stringify(existing));
  const size = (JSON.stringify(existing).length / 1024).toFixed(0);
  console.log(`\n✅ produsen.json diupdate (${size} KB, +${totalNew} data baru)`);
  console.log('✅ Selesai!');
}

main();
