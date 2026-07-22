#!/usr/bin/env node

/**
 * ============================================
 * SCRAPE SISKAPERBAPO JAWA TIMUR
 * ============================================
 * 
 * Scrape harga pangan dari siskaperbapo.jatimprov.go.id
 * 
 * Cara pakai:
 *   node scripts/scrape-siskaperbapo.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Komoditas yang diambil (sesuai nama di SISKAPERBAPO)
const COMMODITY_MAP = {
  'Bawang Merah': 'Bawang Merah / kg',
  'Bawang Putih': 'Bawang Putih / kg',
  'Cabai Rawit': 'Cabe Rawit Merah / kg',
  'Cabai Merah': 'Cabe Merah Besar / kg',
  'Beras': 'Beras Medium / kg',
  'Gula Pasir': 'Gula Kristal Putih / kg',
  'Minyak Goreng': 'Minyak Goreng Curah / kg',
  'Daging Ayam': 'Daging Ayam Ras / kg',
  'Telur Ayam': 'Telur Ayam Ras / kg'
};

// Nama komoditas di halaman produsen (berbeda dari konsumen)
const PRODUCER_COMMODITY_MAP = {
  'Bawang Merah': ['Bawang Merah'],
  'Bawang Putih': ['Bawang Putih'],
  'Cabai Rawit': ['Cabe Rawit'],
  'Cabai Merah': ['Cabe Besar'],
  'Beras': ['Beras'],
  'Gula Pasir': ['Gula'],
  'Minyak Goreng': ['Minyak Goreng'],
  'Daging Ayam': ['Ayam Potong'],
  'Telur Ayam': ['Telur']
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
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

function fetchUrlWithPost(url, postData) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function parsePrices(html) {
  const prices = {};
  
  for (const [ourName, siskaperbapoName] of Object.entries(COMMODITY_MAP)) {
    // Pattern: <td>Nama Komoditas</td> ... <td>HARGA</td>
    // Harga format: 32.893 (dengan titik sebagai pemisah ribuan)
    const escaped = siskaperbapoName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Cari baris yang mengandung nama komoditas, lalu ambil harga
    const rowRegex = new RegExp(
      escaped + '</td>[\\s\\S]*?<td[^>]*>([\\d.,]+)\\s*<span',
      'i'
    );
    
    const match = html.match(rowRegex);
    if (match) {
      // Format: 32.893 (titik = pemisah ribuan)
      const priceStr = match[1].replace(/\./g, '');
      const price = parseInt(priceStr);
      if (price > 1000 && price < 500000) {
        prices[ourName] = price;
      }
    }
  }
  
  return prices;
}

function parseProducerPrices(html) {
  // Parse halaman produsen: per pasar, per komoditas
  // Format per row: <tr>...<td>Nama</td>...<td class="right">KEMARIN</td><td class="right">SEKARANG</td>...
  const allPrices = {};
  
  for (const [ourName, aliases] of Object.entries(PRODUCER_COMMODITY_MAP)) {
    allPrices[ourName] = [];
  }
  
  // Split by <tr> to process each row
  const rows = html.split(/<tr>/i);
  
  for (const row of rows) {
    // Skip header rows
    if (!row.includes('<td>')) continue;
    
    // Extract all <td> content
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(cellMatch[1].trim().replace(/<[^>]+>/g, '').trim());
    }
    
    // Need at least 7 cells: NO, NAMA, TITIK_PANTAU, KABUPATEN, SATUAN, KEMARIN, SEKARANG
    if (cells.length < 7) continue;
    
    const commodityName = cells[1];
    const hargaKemarin = cells[5];
    const hargaSekarang = cells[6];
    
    // Skip if harga sekarang is "-"
    if (hargaSekarang === '-' || hargaSekarang === '') continue;
    
    // Parse harga
    const priceStr = hargaSekarang.replace(/\./g, '').replace(/,/g, '');
    const price = parseInt(priceStr);
    if (isNaN(price) || price < 1000 || price > 500000) continue;
    
    // Match commodity name
    for (const [ourName, aliases] of Object.entries(PRODUCER_COMMODITY_MAP)) {
      for (const alias of aliases) {
        if (commodityName.toLowerCase().includes(alias.toLowerCase())) {
          allPrices[ourName].push(price);
          break;
        }
      }
    }
  }
  
  // Rata-ratakan per komoditas
  const avgPrices = {};
  for (const [name, prices] of Object.entries(allPrices)) {
    if (prices.length > 0) {
      avgPrices[name] = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    }
  }
  
  return avgPrices;
}

async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  🍚 SCRAPE SISKAPERBAPO JAWA TIMUR');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));
  
  const today = new Date().toISOString().slice(0, 10);
  
  // 1. Scrape harga konsumen
  console.log('\n📡 Mengambil data harga konsumen...');
  let consumerPrices = {};
  try {
    const html = await fetchUrl('https://siskaperbapo.jatimprov.go.id/');
    console.log(`   ✓ Halaman konsumen berhasil diambil (${(html.length / 1024).toFixed(1)} KB)`);
    consumerPrices = parsePrices(html);
    console.log(`   ✓ ${Object.keys(consumerPrices).length} komoditas ditemukan`);
  } catch (err) {
    console.log(`   ✗ Gagal mengambil data konsumen: ${err.message}`);
  }
  
  // 2. Scrape harga produsen
  console.log('\n📡 Mengambil data harga produsen...');
  let producerPrices = {};
  try {
    const prodHtml = await fetchUrlWithPost(
      'https://siskaperbapo.jatimprov.go.id/produsen/tabel.nodesign/',
      `tanggal=${today}`
    );
    console.log(`   ✓ Halaman produsen berhasil diambil (${(prodHtml.length / 1024).toFixed(1)} KB)`);
    producerPrices = parseProducerPrices(prodHtml);
    const count = Object.keys(producerPrices).length;
    console.log(`   ✓ ${count} komoditas ditemukan`);
    if (count > 0) {
      for (const [name, price] of Object.entries(producerPrices)) {
        console.log(`     - ${name}: Rp${price.toLocaleString('id-ID')}/kg`);
      }
    }
  } catch (err) {
    console.log(`   ✗ Gagal mengambil data produsen: ${err.message}`);
  }
  
  if (Object.keys(consumerPrices).length === 0 && Object.keys(producerPrices).length === 0) {
    console.log('\n❌ Tidak dapat menemukan data harga');
    return;
  }
  
  console.log('\n' + '─'.repeat(50));
  console.log('📊 HARGA PANGAN JAWA TIMUR (SISKAPERBAPO):');
  console.log('─'.repeat(50));
  console.log('  Konsumen:');
  for (const [name, price] of Object.entries(consumerPrices)) {
    console.log(`    ${name}: Rp${price.toLocaleString('id-ID')}/kg`);
  }
  console.log('  Produsen:');
  for (const [name, price] of Object.entries(producerPrices)) {
    console.log(`    ${name}: Rp${price.toLocaleString('id-ID')}/kg`);
  }
  
  // Output JSON (live data untuk today)
  const output = {
    source: 'SISKAPERBAPO Jatim',
    region: 'Jawa Timur',
    date: new Date().toISOString(),
    prices: consumerPrices,
    producerPrices: producerPrices
  };
  
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(outDir, 'siskaperbapo.json'),
    JSON.stringify(output, null, 2)
  );
  
  console.log('\n✅ Data tersimpan di data/siskaperbapo.json');
  
  // ============================================
  // AKUMULASI HISTORIS — database harian
  // ============================================
  const historyPath = path.join(outDir, 'prices-history.json');
  let history = { daily: {}, monthly: {} };
  
  // Baca history yang sudah ada
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch(e) {
      console.log('⚠ History corrupt, mulai baru');
      history = { daily: {}, monthly: {} };
    }
  }
  
  // Simpan data hari ini ke daily
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  history.daily[todayStr] = consumerPrices;
  if (Object.keys(producerPrices).length > 0) {
    if (!history.daily[todayStr + '_produsen']) history.daily[todayStr + '_produsen'] = {};
    history.daily[todayStr + '_produsen'] = producerPrices;
  }
  
  // Simpan juga ke monthly (key: YYYY-MM)
  const monthKey = todayStr.slice(0, 7); // YYYY-MM
  if (!history.monthly) history.monthly = {};
  if (!history.monthly[monthKey]) history.monthly[monthKey] = {};
  // Rata-rata dari semua harga hari ini dalam bulan tersebut
  // (akan di-update setiap hari, ambil rata-rata terakhir)
  const daysInMonth = Object.keys(history.daily).filter(d => d.startsWith(monthKey)).length;
  for (const [name, price] of Object.entries(consumerPrices)) {
    const monthPrices = Object.entries(history.daily)
      .filter(([d]) => d.startsWith(monthKey) && !d.endsWith('_produsen'))
      .map(([, prices]) => prices[name])
      .filter(p => p != null);
    if (monthPrices.length > 0) {
      history.monthly[monthKey][name] = Math.round(monthPrices.reduce((a,b) => a+b, 0) / monthPrices.length);
    }
  }
  
  // Bersihkan data lebih dari 90 hari (hemat storage)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const key of Object.keys(history.daily)) {
    if (key < cutoffStr && !key.endsWith('_produsen')) {
      delete history.daily[key];
    }
    if ((key.replace('_produsen','') < cutoffStr) && key.endsWith('_produsen')) {
      delete history.daily[key];
    }
  }
  
  history.lastUpdate = new Date().toISOString();
  
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  console.log(`✅ History akumulasi: ${Object.keys(history.daily).length} hari tersimpan`);
  console.log(`   Monthly: ${Object.keys(history.monthly).length} bulan`);
}

main();
