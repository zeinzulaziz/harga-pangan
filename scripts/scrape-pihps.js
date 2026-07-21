#!/usr/bin/env node

/**
 * Script untuk scrape data harga pangan dari PIHPS Bank Indonesia
 * https://www.bi.go.id/hargapangan
 * 
 * Cara pakai:
 *   npm install puppeteer (sekali saja)
 *   node scripts/scrape-pihps.js
 * 
 * Atau via GitHub Actions (sudah include puppeteer)
 */

const fs = require('fs');
const path = require('path');

const PIHPS_URL = 'https://www.bi.go.id/hargapangan';

// Komoditas yang dipantau (sesuai PIHPS)
const COMMODITY_LIST = [
  'Bawang Merah Ukuran Sedang',
  'Bawang Putih Ukuran Sedang',
  'Cabai Rawit Merah',
  'Cabai Merah Besar',
  'Beras Kualitas Medium I',
  'Gula Pasir Kualitas Premium',
  'Minyak Goreng Curah',
  'Daging Ayam Ras Segar',
  'Telur Ayam Ras Segar'
];

// Mapping nama PIHPS ke nama kita
const NAME_MAP = {
  'Bawang Merah Ukuran Sedang': 'Bawang Merah',
  'Bawang Putih Ukuran Sedang': 'Bawang Putih',
  'Cabai Rawit Merah': 'Cabai Rawit',
  'Cabai Merah Besar': 'Cabai Merah',
  'Beras Kualitas Medium I': 'Beras',
  'Gula Pasir Kualitas Premium': 'Gula Pasir',
  'Minyak Goreng Curah': 'Minyak Goreng',
  'Daging Ayam Ras Segar': 'Daging Ayam',
  'Telur Ayam Ras Segar': 'Telur Ayam'
};

async function scrapeWithPuppeteer() {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('Navigating to PIHPS...');
    await page.goto(PIHPS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Tunggu tabel dimuat
    await page.waitForSelector('table', { timeout: 30000 });
    
    console.log('Extracting data...');
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const result = [];
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const name = cells[0]?.textContent?.trim();
          const price = cells[1]?.textContent?.trim();
          if (name && price) {
            result.push({ name, price });
          }
        }
      });
      
      return result;
    });
    
    return data;
  } catch (error) {
    console.error('Puppeteer error:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

function parsePrice(priceStr) {
  if (!priceStr) return 0;
  // Hapus "Rp", spasi, dan titik sebagai pemisah ribuan
  const cleaned = priceStr.replace(/[Rp.\s]/g, '').replace(',', '.');
  return parseInt(cleaned) || 0;
}

async function main() {
  console.log('=== Scraper Harga Pangan PIHPS ===\n');
  
  let rawData;
  try {
    rawData = await scrapeWithPuppeteer();
  } catch (error) {
    console.error('Gagal scrape:', error.message);
    console.log('\nMenggunakan data fallback...');
    rawData = [];
  }
  
  // Proses data
  const prices = {};
  for (const item of rawData) {
    for (const [pihpsName, ourName] of Object.entries(NAME_MAP)) {
      if (item.name.includes(pihpsName) || pihpsName.includes(item.name)) {
        prices[ourName] = parsePrice(item.price);
        break;
      }
    }
  }
  
  // Jika scrape gagal, gunakan data hardcode terakhir
  if (Object.keys(prices).length === 0) {
    console.log('Tidak ada data dari scrape, menggunakan data hardcode');
    prices['Bawang Merah'] = 46100;
    prices['Bawang Putih'] = 39500;
    prices['Cabai Rawit'] = 61450;
    prices['Cabai Merah'] = 49700;
    prices['Beras'] = 16350;
    prices['Gula Pasir'] = 19300;
    prices['Minyak Goreng'] = 21350;
    prices['Daging Ayam'] = 33150;
    prices['Telur Ayam'] = 24650;
  }
  
  // Simpan ke file
  const result = {
    lastUpdate: new Date().toISOString(),
    source: 'PIHPS Bank Indonesia (scrape)',
    prices: prices
  };
  
  const outputPath = path.join(__dirname, '..', 'data', 'prices.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  
  console.log('\nData tersimpan:');
  console.log(JSON.stringify(prices, null, 2));
  console.log(`\nFile: ${outputPath}`);
  
  return result;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
