#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const COMMODITIES = [
  'Bawang Merah', 'Beras', 'Cabe Rawit', 'Cabe Besar',
  'Telur', 'Ayam Potong', 'Daging Sapi', 'Kentang'
];

const FULL_MODE = process.argv.includes('--full');
const BACKFILL_REQUESTS = Number(process.env.BACKFILL_REQUESTS || 52);
const REQUEST_DELAY_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchUrl(url, attempt = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, url).toString();
        response.resume();
        return fetchUrl(redirectUrl, attempt).then(resolve).catch(reject);
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        resolve(data);
      });
    });

    request.setTimeout(30000, () => request.destroy(new Error('request timeout')));
    request.on('error', reject);
  }).catch(async (error) => {
    if (attempt >= 2) throw error;
    await sleep(1000 * (attempt + 1));
    return fetchUrl(url, attempt + 1);
  });
}

function parseGrafikJson(html) {
  try {
    const colsMatch = html.match(/"cols":\[(.*?)\]/);
    const columns = [];

    if (colsMatch) {
      const colRegex = /"label":"([^"]+)"/g;
      let match;
      while ((match = colRegex.exec(colsMatch[1])) !== null) {
        columns.push(match[1]);
      }
    }

    const start = html.indexOf('"rows"');
    if (start === -1) return { columns: [], rows: {} };

    const rowsStart = html.indexOf('[', start);
    let depth = 0;
    let rowsEnd = rowsStart;
    for (let i = rowsStart; i < html.length; i++) {
      if (html[i] === '[') depth++;
      if (html[i] === ']') depth--;
      if (depth === 0) {
        rowsEnd = i + 1;
        break;
      }
    }

    const rowsString = html.substring(rowsStart, rowsEnd)
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}');
    const rows = JSON.parse(rowsString);
    const result = {};

    for (const row of rows) {
      if (!row.c || row.c.length < 2 || !row.c[0].v) continue;
      result[row.c[0].v] = row.c.slice(1).map(cell => cell.v ?? null);
    }

    return { columns: columns.slice(1), rows: result };
  } catch (error) {
    return { columns: [], rows: {} };
  }
}

function isValidPrice(value) {
  return Number.isFinite(value) && value > 0;
}

function formatDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function loadExistingData(outDir) {
  const filePath = path.join(outDir, 'produsen.json');
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`Gagal membaca produsen.json: ${error.message}`);
  }
}

function mergeRows(targetColumns, targetRows, sourceColumns, sourceRows) {
  const sourceIndexes = new Map(sourceColumns.map((column, index) => [column, index]));

  for (const column of sourceColumns) {
    if (!targetColumns.includes(column)) targetColumns.push(column);
  }

  for (const [date, sourceValues] of Object.entries(sourceRows)) {
    const previousValues = Array.isArray(targetRows[date]) ? targetRows[date] : [];
    targetRows[date] = targetColumns.map((column, targetIndex) => {
      const sourceIndex = sourceIndexes.get(column);
      const sourceValue = sourceIndex === undefined ? null : sourceValues[sourceIndex];
      if (isValidPrice(sourceValue)) return sourceValue;

      const previousValue = previousValues[targetIndex];
      return isValidPrice(previousValue) ? previousValue : null;
    });
  }
}

function fillMissingPrices(rows, columns) {
  const previous = Array(columns.length).fill(null);

  for (const date of Object.keys(rows).sort()) {
    const current = Array.isArray(rows[date]) ? rows[date] : [];
    const normalized = columns.map((column, index) => {
      if (isValidPrice(current[index])) return current[index];
      return isValidPrice(previous[index]) ? previous[index] : null;
    });

    rows[date] = normalized;
    normalized.forEach((value, index) => {
      if (isValidPrice(value)) previous[index] = value;
    });
  }
}

function updateCommodity(target, sourceColumns, sourceRows) {
  const commodity = target || { columns: [], prices: {} };
  if (!Array.isArray(commodity.columns)) commodity.columns = [];
  if (!commodity.prices || typeof commodity.prices !== 'object') commodity.prices = {};

  mergeRows(commodity.columns, commodity.prices, sourceColumns, sourceRows);
  fillMissingPrices(commodity.prices, commodity.columns);

  const dates = Object.keys(commodity.prices).sort();
  commodity.days = dates.length;
  commodity.dateRange = dates.length > 0
    ? { from: dates[0], to: dates[dates.length - 1] }
    : {};
  return commodity;
}

function saveHistoryFiles(outDir, commodity, columns, rows) {
  const historyDir = path.join(outDir, 'history');
  let saved = 0;

  for (const [date, prices] of Object.entries(rows)) {
    if (!prices.some(isValidPrice)) continue;

    const monthDir = path.join(historyDir, date.slice(0, 4), date.slice(0, 7));
    fs.mkdirSync(monthDir, { recursive: true });

    const filePath = path.join(monthDir, `${date}.json`);
    let dayData = {};
    if (fs.existsSync(filePath)) {
      try {
        dayData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (error) {
        dayData = {};
      }
    }

    dayData.date = date;
    dayData.source = 'SISKAPERBAPO Jatim';
    dayData.type = 'produsen';
    dayData[commodity] = {};

    columns.forEach((column, index) => {
      if (isValidPrice(prices[index])) dayData[commodity][column] = prices[index];
    });

    if (Object.keys(dayData[commodity]).length === 0) continue;
    fs.writeFileSync(filePath, JSON.stringify(dayData, null, 2));
    saved++;
  }

  return saved;
}

async function scrapeCommodity(commodity, date, requests) {
  const url = `https://siskaperbapo.jatimprov.go.id/produsen/grafik?tanggal=${date}&bhnpokok=${encodeURIComponent(commodity)}`;
  const html = await fetchUrl(url);
  const parsed = parseGrafikJson(html);
  requests.count++;
  return parsed;
}

async function runFull(outDir, now, existing) {
  console.log('\n' + '═'.repeat(50));
  console.log(`  📊 FULL SCRAPE — ${BACKFILL_REQUESTS} REQUEST HISTORIS`);
  console.log('  📅 ' + now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));

  const output = existing || {
    source: 'SISKAPERBAPO Jatim',
    type: 'produsen',
    commodities: {}
  };
  output.source = 'SISKAPERBAPO Jatim';
  output.type = 'produsen';
  if (!output.commodities) output.commodities = {};

  const requests = { count: 0 };
  let successful = 0;

  for (const commodity of COMMODITIES) {
    console.log(`\n🧅 ${commodity}:`);
    const sourceColumns = [];
    const sourceRows = {};

    for (let i = 0; i < BACKFILL_REQUESTS; i++) {
      const date = formatDate(addDays(now, -i * 28));
      process.stdout.write(`  ${date}...`);
      try {
        const parsed = await scrapeCommodity(commodity, date, requests);
        mergeRows(sourceColumns, sourceRows, parsed.columns, parsed.rows);
        console.log(` ${Object.keys(parsed.rows).length} hari`);
        if (parsed.columns.length > 0 || Object.keys(parsed.rows).length > 0) successful++;
      } catch (error) {
        console.log(` gagal: ${error.message}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }

    const target = updateCommodity(output.commodities[commodity], sourceColumns, sourceRows);
    output.commodities[commodity] = target;
    saveHistoryFiles(outDir, commodity, target.columns, target.prices);
    console.log(`  ✓ Total: ${target.days} hari`);
  }

  if (successful === 0) throw new Error('Semua request historis gagal atau tidak menghasilkan data');
  output.lastUpdate = now.toISOString();
  fs.writeFileSync(path.join(outDir, 'produsen.json'), JSON.stringify(output));
  console.log(`\n✅ produsen.json tersimpan (${(JSON.stringify(output).length / 1024).toFixed(0)} KB)`);
  console.log(`✅ ${requests.count} request selesai`);
}

async function runDaily(outDir, now, existing) {
  console.log('\n' + '═'.repeat(50));
  console.log('  📊 DAILY SCRAPE — UPDATE HARIAN PRODUSEN');
  console.log('  📅 ' + now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  console.log('═'.repeat(50));

  if (!existing) {
    throw new Error('produsen.json tidak ditemukan. Jalankan npm run scrape:full terlebih dahulu');
  }

  if (!existing.commodities) existing.commodities = {};
  const today = formatDate(now);
  const requests = { count: 0 };
  let successful = 0;
  let totalNew = 0;

  for (const commodity of COMMODITIES) {
    process.stdout.write(`\n🧅 ${commodity}: `);
    try {
      const parsed = await scrapeCommodity(commodity, today, requests);
      const sourceDates = Object.keys(parsed.rows).sort();
      if (sourceDates.length === 0) {
        console.log('tidak ada data dari sumber');
        continue;
      }

      successful++;
      const existingDates = new Set(Object.keys(existing.commodities[commodity]?.prices || {}));
      const target = updateCommodity(existing.commodities[commodity], parsed.columns, parsed.rows);
      existing.commodities[commodity] = target;

      const historyRows = {};
      for (const date of sourceDates) {
        if (target.prices[date]) historyRows[date] = target.prices[date];
        if (!existingDates.has(date) && target.prices[date]?.some(isValidPrice)) totalNew++;
      }
      saveHistoryFiles(outDir, commodity, target.columns, historyRows);
      console.log(`${sourceDates.length} hari diproses, ${target.days} total`);
    } catch (error) {
      console.log(`gagal: ${error.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  if (successful === 0) throw new Error('Semua request harian gagal atau tidak menghasilkan data');
  existing.lastUpdate = now.toISOString();
  fs.writeFileSync(path.join(outDir, 'produsen.json'), JSON.stringify(existing));
  console.log(`\n✅ produsen.json diupdate (${(JSON.stringify(existing).length / 1024).toFixed(0)} KB, +${totalNew} tanggal baru)`);
  console.log(`✅ ${requests.count} request selesai`);
}

async function main() {
  const now = new Date();
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const existing = loadExistingData(outDir);

  if (FULL_MODE) {
    await runFull(outDir, now, existing);
  } else {
    await runDaily(outDir, now, existing);
  }
}

main().catch(error => {
  console.error(`\n❌ ${error.message}`);
  process.exitCode = 1;
});
