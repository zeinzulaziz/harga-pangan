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

async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  🍚 SCRAPE SISKAPERBAPO JAWA TIMUR');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));
  
  console.log('\n📡 Mengambil data dari siskaperbapo.jatimprov.go.id...');
  
  try {
    const html = await fetchUrl('https://siskaperbapo.jatimprov.go.id/');
    console.log(`   ✓ Halaman berhasil diambil (${(html.length / 1024).toFixed(1)} KB)`);
    
    console.log('\n📦 Parsing harga...');
    const prices = parsePrices(html);
    
    if (Object.keys(prices).length === 0) {
      console.log('\n❌ Tidak dapat menemukan data harga');
      console.log('   Kemungkinan struktur website berubah');
      return;
    }
    
    console.log('\n' + '─'.repeat(50));
    console.log('📊 HARGA PANGAN JAWA TIMUR (SISKAPERBAPO):');
    console.log('─'.repeat(50));
    for (const [name, price] of Object.entries(prices)) {
      console.log(`   ${name}: Rp${price.toLocaleString('id-ID')}/kg`);
    }
    
    // Output JSON
    const output = {
      source: 'SISKAPERBAPO Jatim',
      region: 'Jawa Timur',
      date: new Date().toISOString(),
      prices: prices
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
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
}

main();
