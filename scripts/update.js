#!/usr/bin/env node

/**
 * ========================================
 * UPDATE HARGA PANGAN - Script Utama
 * ========================================
 * 
 * Cara pakai:
 *   node scripts/update.js
 * 
 * Atau pakai npm:
 *   npm run update
 * 
 * Script ini akan:
 * 1. Fetch harga dari API NFA (jika ada API key)
 * 2. Atau scrape dari PIHPS (fallback)
 * 3. Update tanggal di index.html
 * 4. Tampilkan hasil untuk di-push manual
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'prices.json');

// Waktu Jakarta
function getJakartaDate() {
  return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function getJakartaDateString() {
  const now = new Date();
  const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' };
  return now.toLocaleDateString('id-ID', options);
}

// Jalankan command
function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  } catch (e) {
    return null;
  }
}

// Step 1: Fetch data
async function fetchData() {
  console.log('📡 Fetching data harga pangan...\n');
  
  const apiKey = process.env.NFA_API_KEY;
  
  if (apiKey) {
    console.log('✅ API key ditemukan, menggunakan API NFA...');
    try {
      run('node scripts/fetch-prices.js');
      return { source: 'NFA API', success: true };
    } catch (e) {
      console.log('⚠️  API gagal, coba scrape...');
    }
  }
  
  console.log('🔍 Scrape dari PIHPS Bank Indonesia...');
  try {
    run('node scripts/scrape-pihps.js');
    return { source: 'PIHPS Scrape', success: true };
  } catch (e) {
    console.log('⚠️  Scrape gagal, gunakan data hardcode');
    return { source: 'Hardcode', success: false };
  }
}

// Step 2: Update tanggal
function updateDate() {
  console.log('\n📅 Updating tanggal...');
  
  const today = getJakartaDateString();
  let content = fs.readFileSync(INDEX_FILE, 'utf-8');
  
  // Update badge "Update: ..."
  content = content.replace(
    /Update: \d+ \w+ \d+/g,
    `Update: ${today}`
  );
  
  // Update subtitle "Per ... —"
  content = content.replace(
    /Per \w+ \d+ —/g,
    `Per ${today} —`
  );
  
  fs.writeFileSync(INDEX_FILE, content);
  console.log(`   Tanggal diupdate ke: ${today}`);
}

// Step 3: Tampilkan status
function showStatus() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 STATUS UPDATE');
  console.log('='.repeat(50));
  
  // Cek perubahan
  const diff = run('git diff --stat');
  if (diff) {
    console.log('\n📁 File yang berubah:');
    console.log(diff);
  } else {
    console.log('\n✅ Tidak ada perubahan data');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🚀 LANGKAH SELANJUTNYA:');
  console.log('='.repeat(50));
  console.log(`
  1. Cek perubahan:
     git diff

  2. Stage file:
     git add -A

  3. Commit:
     git commit -m "update: harga pangan ${getJakartaDateString()}"

  4. Push:
     git push origin master

  Atau jalankan sekaligus:
  ───────────────────────
  git add -A && git commit -m "update: harga pangan ${getJakartaDateString()}" && git push
  ───────────────────────
`);
}

// Main
async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('  🍚 UPDATE HARGA PANGAN INDONESIA');
  console.log('  📅 ' + getJakartaDate());
  console.log('═'.repeat(50) + '\n');
  
  await fetchData();
  updateDate();
  showStatus();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
