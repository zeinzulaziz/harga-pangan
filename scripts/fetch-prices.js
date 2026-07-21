#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.NFA_API_KEY;
const API_URL = 'https://webapi.badanpangan.go.id/v1/harga/pangan';

const COMMODITY_MAP = {
  'Bawang Merah': 'bawang_merah',
  'Bawang Putih': 'bawang_putih',
  'Cabai Rawit': 'cabai_rawit_merah',
  'Cabai Merah': 'cabai_merah_besar',
  'Beras': 'beras_medium_i',
  'Gula Pasir': 'gula_premium',
  'Minyak Goreng': 'minyak_goreng_curah',
  'Daging Ayam': 'daging_ayam_ras',
  'Telur Ayam': 'telur_ayam_ras'
};

const PROVINCE_MAP = {
  'nasional': '',
  'jawa_timur': '35',
  'jawa_tengah': '33',
  'jawa_barat': '32',
  'dki_jakarta': '31',
  'sumatera_utara': '12',
  'sulawesi_selatan': '73',
  'bali': '51'
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'X-Authorization': API_KEY,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function fetchPrices() {
  if (!API_KEY) {
    console.error('Error: NFA_API_KEY environment variable not set');
    console.error('Get your API key at: https://webapi.badanpangan.go.id/register');
    process.exit(1);
  }

  console.log('Fetching price data from NFA API...');

  const result = {
    lastUpdate: new Date().toISOString(),
    sources: ['NFA - Badan Pangan Nasional'],
    national: {},
    regional: {}
  };

  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7);

    const formatDate = (d) => d.toISOString().split('T')[0];

    const url = `${API_URL}?start_date=${formatDate(startDate)}&end_date=${formatDate(today)}`;
    const response = await fetchJSON(url);

    if (response.data && Array.isArray(response.data)) {
      for (const item of response.data) {
        const commodityName = item.nama_komoditas || item.komoditas;
        const price = item.harga || item.harga_rata_rata;
        const province = item.nama_propinsi || 'Nasional';

        if (!result.national[commodityName]) {
          result.national[commodityName] = [];
        }
        result.national[commodityName].push({
          date: item.tanggal || item.tanggal_harga,
          price: price,
          province: province
        });
      }
    }

    console.log(`Fetched ${Object.keys(result.national).length} commodities`);
  } catch (error) {
    console.error('API fetch failed:', error.message);
    console.log('Falling back to last known data...');
  }

  const outputPath = path.join(__dirname, '..', 'data', 'prices.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Data saved to ${outputPath}`);

  return result;
}

if (require.main === module) {
  fetchPrices().catch(console.error);
}

module.exports = { fetchPrices };
