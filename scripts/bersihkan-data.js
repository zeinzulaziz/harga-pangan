#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WINDOW_DAYS = 7;
const MIN_NEIGHBORS = 2;
const UPPER_RATIO = 4;
const LOWER_RATIO = 0.25;

const DATA_PATH = path.join(__dirname, '..', 'data', 'produsen.json');

// Koreksi manual untuk nilai yang dipastikan salah input tapi rasio < threshold.
// Berlaku hanya jika nilai saat ini masih sama dengan `value` (supaya tidak
// menghapus nilai lain yang sudah dikoreksi sumber).
const CORRECTIONS = [
  {
    commodity: 'Bawang Merah',
    column: 'Pasar Dlinggu Kabupaten Probolinggo',
    date: '2026-09-20',
    value: 62000
  },
  {
    commodity: 'Bawang Merah',
    column: 'Pasar Dlinggu Kabupaten Probolinggo',
    date: '2017-03-03',
    value: 290000,
    replacement: 29000
  },
  {
    commodity: 'Bawang Merah',
    column: 'Pasar Dlinggu Kabupaten Probolinggo',
    date: '2017-03-04',
    value: 290000,
    replacement: 29000
  }
];

function valid(value) {
  return Number.isFinite(value) && value > 0;
}

function isValidPrice(value) {
  return Number.isFinite(value) && value > 0;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function detectAnomalies(commodity, info) {
  const anomalies = [];
  const dates = Object.keys(info.prices).sort();

  for (let colIndex = 0; colIndex < info.columns.length; colIndex++) {
    const column = info.columns[colIndex];
    const observed = [];

    for (const date of dates) {
      const flags = info.imputed[date] || [];
      const value = info.prices[date][colIndex];
      if (isValidPrice(value) && !flags[colIndex]) observed.push({ date, value });
    }

    for (let k = 0; k < observed.length; k++) {
      const current = observed[k];
      const lo = addDays(new Date(current.date), -WINDOW_DAYS);
      const hi = addDays(new Date(current.date), WINDOW_DAYS);
      const loString = lo.toISOString().slice(0, 10);
      const hiString = hi.toISOString().slice(0, 10);
      const neighbors = [];

      for (let j = 0; j < observed.length; j++) {
        if (j === k) continue;
        if (observed[j].date >= loString && observed[j].date <= hiString) {
          neighbors.push(observed[j].value);
        }
      }

      if (neighbors.length < MIN_NEIGHBORS) continue;
      const center = median(neighbors);
      if (!center) continue;
      const ratio = current.value / center;
      if (ratio > UPPER_RATIO || ratio < LOWER_RATIO) {
        anomalies.push({
          column,
          date: current.date,
          value: current.value,
          median: center,
          ratio: Number(ratio.toFixed(3))
        });
      }
    }
  }

  return anomalies;
}

function fillMissingPrices(rows, columns, imputedRows = {}) {
  const previous = Array(columns.length).fill(null);

  for (const date of Object.keys(rows).sort()) {
    const current = Array.isArray(rows[date]) ? rows[date] : [];
    const flags = Array.isArray(imputedRows[date]) ? imputedRows[date] : [];
    const normalized = columns.map((column, index) => {
      if (isValidPrice(current[index])) return current[index];
      if (isValidPrice(previous[index])) flags[index] = true;
      return isValidPrice(previous[index]) ? previous[index] : null;
    });

    rows[date] = normalized;
    if (flags.some(Boolean)) imputedRows[date] = flags;
    else delete imputedRows[date];
    normalized.forEach((value, index) => {
      if (isValidPrice(value)) previous[index] = value;
    });
  }
}

function saveHistoryFiles(outDir, commodity, columns, rows, imputedRows = {}) {
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
    const imputedColumns = {};
    (imputedRows[date] || []).forEach((flag, index) => {
      if (flag && columns[index]) imputedColumns[columns[index]] = true;
    });
    if (Object.keys(imputedColumns).length > 0) {
      dayData.imputed = dayData.imputed || {};
      dayData.imputed[commodity] = imputedColumns;
    } else if (dayData.imputed) {
      delete dayData.imputed[commodity];
      if (Object.keys(dayData.imputed).length === 0) delete dayData.imputed;
    }
    fs.writeFileSync(filePath, JSON.stringify(dayData, null, 2));
    saved++;
  }

  return saved;
}

function applyCorrections(data) {
  const changed = new Set();

  for (const correction of CORRECTIONS) {
    const info = data.commodities[correction.commodity];
    if (!info) continue;
    const colIndex = info.columns.indexOf(correction.column);
    if (colIndex === -1) continue;
    const prices = info.prices[correction.date];
    if (!prices || prices[colIndex] !== correction.value) continue;

    if (correction.replacement != null) {
      prices[colIndex] = correction.replacement;
      if (info.imputed[correction.date]) info.imputed[correction.date][colIndex] = false;
      console.log(`  ${correction.commodity} | ${correction.column} | ${correction.date} | ${correction.value} -> {perbaiki: ${correction.replacement}}`);
    } else {
      prices[colIndex] = null;
      if (!info.imputed[correction.date]) info.imputed[correction.date] = [];
      info.imputed[correction.date][colIndex] = true;
      console.log(`  ${correction.commodity} | ${correction.column} | ${correction.date} | ${correction.value} -> {hapus}`);
    }
    changed.add(correction.commodity);
  }

  return changed;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  let totalAnomalies = 0;
  const corrected = applyCorrections(data);

  for (const [commodity, info] of Object.entries(data.commodities)) {
    const anomalies = detectAnomalies(commodity, info);
    totalAnomalies += anomalies.length;

    if (anomalies.length === 0 && !corrected.has(commodity)) {
      console.log(`${commodity}: bersih`);
      continue;
    }

    for (const anomaly of anomalies) {
      const prices = info.prices[anomaly.date];
      const colIndex = info.columns.indexOf(anomaly.column);
      prices[colIndex] = null;
      if (info.imputed[anomaly.date]) info.imputed[anomaly.date][colIndex] = true;
      console.log(`  ${commodity} | ${anomaly.column} | ${anomaly.date} | ${anomaly.value} -> {hapus} (median ${anomaly.median}, rasio ${anomaly.ratio})`);
    }

    fillMissingPrices(info.prices, info.columns, info.imputed);
    const dates = Object.keys(info.prices).sort();
    info.days = dates.length;
    info.dateRange = dates.length > 0
      ? { from: dates[0], to: dates[dates.length - 1] }
      : {};
  }

  data.lastUpdate = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data));
  console.log(`\n✅ ${totalAnomalies} data tidak normal dihapus, ${corrected.size ? [...corrected].length + ' komoditas dikoreksi' : 'tanpa koreksi manual'}`);

  const outDir = path.join(__dirname, '..', 'data');
  let historySaved = 0;
  for (const [commodity, info] of Object.entries(data.commodities)) {
    historySaved += saveHistoryFiles(outDir, commodity, info.columns, info.prices, info.imputed);
  }
  console.log(`✅ ${historySaved} file histori diperbarui`);
}

main();