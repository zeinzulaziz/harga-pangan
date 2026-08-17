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

function fetchPost(url, formData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = new URLSearchParams(formData).toString();
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function parseGrafikJson(html) {
  try {
    const start = html.indexOf('"rows"');
    if (start === -1) return [];
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
      if (!row.c || row.c.length < 3) continue;
      const date = row.c[0].v;
      const price1 = row.c[1].v;
      const price2 = row.c[2].v;
      if (date && (price1 || price2)) {
        result[date] = { p1: price1, p2: price2 };
      }
    }
    return result;
  } catch (e) {
    return {};
  }
}

function formatDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

async function scrapeTabel(tanggal) {
  console.log(`\n📡 Scrape tabel produsen tanggal ${tanggal}...`);
  try {
    const html = await fetchPost('https://siskaperbapo.jatimprov.go.id/produsen/tabel.nodesign', { tanggal });
    const rows = html.split(/<tr>/i);
    const prices = {};

    for (const row of rows) {
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cm;
      while ((cm = cellRegex.exec(row)) !== null) {
        cells.push(cm[1].replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length < 7) continue;

      const commodity = cells[1];
      const pasar = cells[2];
      const kabupaten = cells[3];
      const hargaKemarin = cells[5];
      const hargaSekarang = cells[6];

      if (!COMMODITIES.includes(commodity)) continue;
      if (hargaSekarang === '-' || hargaSekarang === '') continue;

      const price = parseInt(hargaSekarang.replace(/\./g, ''));
      if (isNaN(price) || price < 100 || price > 1000000) continue;

      if (!prices[commodity]) prices[commodity] = [];
      prices[commodity].push({ pasar, kabupaten, price });
    }

    const count = Object.values(prices).reduce((a, b) => a + b.length, 0);
    console.log(`   ✓ ${Object.keys(prices).length} komoditas, ${count} data`);
    return prices;
  } catch (err) {
    console.log(`   ✗ Gagal: ${err.message}`);
    return {};
  }
}

async function scrapeGrafik(commodity, endDate) {
  const tanggal = formatDate(endDate);
  const url = `https://siskaperbapo.jatimprov.go.id/produsen/grafik?tanggal=${tanggal}&bhnpokok=${encodeURIComponent(commodity)}`;
  try {
    const html = await fetchUrl(url);
    return parseGrafikJson(html);
  } catch (err) {
    return {};
  }
}

async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  📊 SCRAPE HARGA PRODUSEN — SISKAPERBAPO JATIM');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));

  const now = new Date();
  const todayStr = formatDate(now);

  const tabelPrices = await scrapeTabel(todayStr);

  console.log('\n📡 Scrape data grafik 1 tahun per komoditas...');
  const grafikData = {};

  for (const commodity of COMMODITIES) {
    console.log(`\n  🧅 ${commodity}:`);
    grafikData[commodity] = {};

    for (let i = 0; i < 13; i++) {
      const endDate = addDays(now, -i * 28);
      const tanggal = formatDate(endDate);
      process.stdout.write(`    ${tanggal}...`);

      const data = await scrapeGrafik(commodity, endDate);
      const count = Object.keys(data).length;
      console.log(` ${count} hari`);

      for (const [date, prices] of Object.entries(data)) {
        grafikData[commodity][date] = prices;
      }

      await new Promise(r => setTimeout(r, 500));
    }

    const totalDays = Object.keys(grafikData[commodity]).length;
    console.log(`  ✓ Total: ${totalDays} hari`);
  }

  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const output = {
    source: 'SISKAPERBAPO Jatim',
    type: 'produsen',
    lastUpdate: now.toISOString(),
    commodities: {},
    todayPrices: tabelPrices
  };

  for (const commodity of COMMODITIES) {
    const dates = Object.keys(grafikData[commodity]).sort();
    if (dates.length === 0) continue;
    output.commodities[commodity] = {
      days: dates.length,
      dateRange: { from: dates[0], to: dates[dates.length - 1] },
      prices: grafikData[commodity]
    };
  }

  fs.writeFileSync(path.join(outDir, 'produsen.json'), JSON.stringify(output));
  const size = (JSON.stringify(output).length / 1024).toFixed(0);
  console.log(`\n✅ Tersimpan di data/produsen.json (${size} KB)`);

  const historyDir = path.join(outDir, 'history');
  if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

  const year = todayStr.slice(0, 4);
  const yearDir = path.join(historyDir, year);
  if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir, { recursive: true });

  const dayData = { date: todayStr, type: 'produsen', lastUpdate: now.toISOString() };
  for (const commodity of COMMODITIES) {
    if (tabelPrices[commodity] && tabelPrices[commodity].length > 0) {
      const prices = tabelPrices[commodity].map(p => p.price);
      dayData[commodity] = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    }
  }

  fs.writeFileSync(path.join(yearDir, `${todayStr}.json`), JSON.stringify(dayData, null, 2));
  console.log(`✅ History ${todayStr}: tersimpan`);
}

main();
