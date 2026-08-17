#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const COMMODITIES = [
  'Bawang Merah', 'Beras', 'Cabe Rawit', 'Cabe Besar',
  'Telur', 'Ayam Potong', 'Daging Sapi', 'Kentang'
];

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

async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  📊 SCRAPE HARGA PRODUSEN — SISKAPERBAPO JATIM');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));

  const now = new Date();
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

    const totalDays = Object.keys(allRows).length;
    console.log(`  ✓ Total: ${totalDays} hari, ${allColumns.length} kolom`);

    grafikData[commodity] = { columns: allColumns, rows: allRows };
  }

  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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
  }

  fs.writeFileSync(path.join(outDir, 'produsen.json'), JSON.stringify(output));
  const size = (JSON.stringify(output).length / 1024).toFixed(0);
  console.log(`\n✅ Tersimpan di data/produsen.json (${size} KB)`);
}

main();
