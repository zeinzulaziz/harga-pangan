#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const KOMODITAS_ID = '39';
const KOMODITAS_NAME = 'Bawang Merah';

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
        'Accept': 'text/html,application/xhtml+xml',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPost(res.headers.location, formData).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function parseProvinceRow(html) {
  const dates = [];
  const dateRegex = /<th class="right">(\d{4}-\d{2}-\d{2})<\/th>/g;
  let m;
  while ((m = dateRegex.exec(html)) !== null) dates.push(m[1]);

  const propinsiMatch = html.match(/Propinsi Jawa Timur<\/td>([\s\S]*?)<\/tr>/i);
  if (!propinsiMatch) return {};

  const cellRegex = /<td class="right">([\d.]+)<\/td>/g;
  const prices = {};
  let idx = 0;
  let cm;
  while ((cm = cellRegex.exec(propinsiMatch[1])) !== null) {
    if (dates[idx]) {
      const price = parseInt(cm[1].replace(/\./g, ''));
      if (price > 1000 && price < 500000) prices[dates[idx]] = price;
    }
    idx++;
  }
  return prices;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  🧅 SCRAPE HARGA BAWANG MERAH — SISKAPERBAPO JATIM');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));

  const now = new Date();
  const allPrices = {};

  for (let i = 0; i < 5; i++) {
    const endDate = addDays(now, -i * 7);
    const tanggal = formatDate(endDate);
    console.log(`\n📡 Fetch tanggal ${tanggal} (7 hari ke belakang)...`);

    try {
      const html = await fetchPost('https://siskaperbapo.jatimprov.go.id/harga-komoditas', {
        tanggal_akhir: tanggal,
        komoditas: KOMODITAS_ID
      });

      const prices = parseProvinceRow(html);
      const count = Object.keys(prices).length;
      console.log(`   ✓ ${count} hari ditemukan`);
      Object.assign(allPrices, prices);
    } catch (err) {
      console.log(`   ✗ Gagal: ${err.message}`);
    }
  }

  const sortedDates = Object.keys(allPrices).sort();
  if (sortedDates.length === 0) {
    console.log('\n❌ Tidak ada data tersedia');
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`📊 HARGA BAWANG MERAH JAWA TIMUR (${sortedDates.length} hari):`);
  console.log('─'.repeat(50));
  for (const d of sortedDates) {
    console.log(`  ${d}: Rp${allPrices[d].toLocaleString('id-ID')}/kg`);
  }

  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const output = {
    source: 'SISKAPERBAPO Jatim',
    commodity: KOMODITAS_NAME,
    region: 'Jawa Timur',
    lastUpdate: now.toISOString(),
    days: sortedDates.length,
    dateRange: { from: sortedDates[0], to: sortedDates[sortedDates.length - 1] },
    prices: allPrices
  };

  fs.writeFileSync(path.join(outDir, 'bawang-merah.json'), JSON.stringify(output, null, 2));
  console.log(`\n✅ Tersimpan di data/bawang-merah.json (${sortedDates.length} hari)`);

  const historyDir = path.join(outDir, 'history');
  if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

  const todayStr = formatDate(now);
  const year = todayStr.slice(0, 4);
  const yearDir = path.join(historyDir, year);
  if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir, { recursive: true });

  const dayPath = path.join(yearDir, `${todayStr}.json`);
  fs.writeFileSync(dayPath, JSON.stringify({
    date: todayStr,
    prices: { [KOMODITAS_NAME]: allPrices[todayStr] || null },
    lastUpdate: now.toISOString()
  }, null, 2));
  console.log(`✅ History ${todayStr}: tersimpan`);
}

main();
