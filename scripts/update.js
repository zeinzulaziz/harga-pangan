#!/usr/bin/env node

/**
 * ========================================
 * UPDATE HARGA PANGAN - Script Utama
 * ========================================
 * 
 * Cara pakai:
 *   npm run update
 * 
 * Script ini akan:
 * 1. Fetch harga dari API/Scrape
 * 2. Update data harga di index.html
 * 3. Update tanggal di index.html
 * 4. Tampilkan hasil untuk di-push manual
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');

// Format tanggal Jakarta
function getJakartaDateString() {
  const now = new Date();
  const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' };
  return now.toLocaleDateString('id-ID', options);
}

// Fetch dari API NFA
async function fetchFromAPI() {
  const apiKey = process.env.NFA_API_KEY;
  if (!apiKey) return null;

  const https = require('https');
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);
  const formatDate = (d) => d.toISOString().split('T')[0];
  
  const url = `https://webapi.badanpangan.go.id/v1/harga/pangan?start_date=${formatDate(startDate)}&end_date=${formatDate(today)}`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'X-Authorization': apiKey, 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && Array.isArray(json.data)) {
            const prices = {};
            const nameMap = {
              'Bawang Merah': ['bawang merah'],
              'Bawang Putih': ['bawang putih'],
              'Cabai Rawit': ['cabai rawit'],
              'Cabai Merah': ['cabai merah besar'],
              'Beras': ['beras medium', 'beras kualitas medium'],
              'Gula Pasir': ['gula pasir', 'gula premium'],
              'Minyak Goreng': ['minyak goreng curah'],
              'Daging Ayam': ['daging ayam'],
              'Telur Ayam': ['telur ayam']
            };
            
            for (const item of json.data) {
              const itemName = (item.nama_komoditas || item.komoditas || '').toLowerCase();
              const price = item.harga || item.harga_rata_rata;
              if (!price) continue;
              
              for (const [ourName, keywords] of Object.entries(nameMap)) {
                if (keywords.some(k => itemName.includes(k)) && !prices[ourName]) {
                  prices[ourName] = Math.round(price);
                }
              }
            }
            
            if (Object.keys(prices).length >= 5) {
              console.log('   ✓ Berhasil fetch dari API NFA');
              resolve(prices);
              return;
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

// Fallback: harga berdasarkan data terakhir yang diketahui
function getFallbackPrices() {
  return {
    'Bawang Merah': 46100,
    'Bawang Putih': 39500,
    'Cabai Rawit': 61450,
    'Cabai Merah': 49700,
    'Beras': 16350,
    'Gula Pasir': 19300,
    'Minyak Goreng': 21350,
    'Daging Ayam': 33150,
    'Telur Ayam': 24650
  };
}

// Update data harga di index.html
function updatePriceData(prices) {
  console.log('\n📦 Updating data harga di index.html...');
  
  let content = fs.readFileSync(INDEX_FILE, 'utf-8');
  
  // Update harga terkini (elemen terakhir array '6m') untuk setiap komoditas
  for (const [name, price] of Object.entries(prices)) {
    // Cari pattern: array '6m' untuk komoditas, update elemen terakhir
    const regex = new RegExp(
      `('${name}'[\\s\\S]*?'6m':\\s*\\[)([\\d,\\s]+)(\\])`,
      'g'
    );
    
    content = content.replace(regex, (match, before, nums, after) => {
      const arr = nums.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      if (arr.length > 0) {
        arr[arr.length - 1] = price; // Update elemen terakhir
        return before + arr.join(',') + after;
      }
      return match;
    });
  }
  
  fs.writeFileSync(INDEX_FILE, content);
  console.log(`   ✓ Harga terkini diupdate`);
}

// Update tanggal di index.html
function updateDate() {
  console.log('\n📅 Updating tanggal...');
  
  const today = getJakartaDateString();
  let content = fs.readFileSync(INDEX_FILE, 'utf-8');
  
  content = content.replace(
    /Update: \d+ \w+ \d+/g,
    `Update: ${today}`
  );
  
  content = content.replace(
    /Per \w+ \d+ —/g,
    `Per ${today} —`
  );
  
  fs.writeFileSync(INDEX_FILE, content);
  console.log(`   ✓ Tanggal diupdate ke: ${today}`);
}

// Main
async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  🍚 UPDATE HARGA PANGAN INDONESIA');
  console.log('  📅 ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));
  
  // Step 1: Fetch data
  console.log('\n📡 Step 1: Fetch data harga...');
  let prices = await fetchFromAPI();
  
  if (!prices) {
    console.log('   ⚠️  API tidak tersedia, menggunakan data terakhir');
    prices = getFallbackPrices();
  }
  
  console.log('   Data harga:');
  for (const [name, price] of Object.entries(prices)) {
    console.log(`   - ${name}: Rp${price.toLocaleString('id-ID')}`);
  }
  
  // Step 2: Update index.html
  console.log('\n📝 Step 2: Update file index.html...');
  updatePriceData(prices);
  updateDate();
  
  // Step 3: Selesai
  console.log('\n' + '═'.repeat(50));
  console.log('✅ SELESAI! File sudah ter-update.');
  console.log('═'.repeat(50));
  console.log(`
🚀 LANGKAH SELANJUTNYA - Push ke GitHub:

  git add -A
  git commit -m "update: harga pangan ${getJakartaDateString()}"
  git push

Atau satu baris:
  git add -A && git commit -m "update harga" && git push
`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
