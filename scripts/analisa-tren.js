#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function loadData() {
  const filePath = path.join(__dirname, '..', 'data', 'produsen.json');
  if (!fs.existsSync(filePath)) throw new Error('data/produsen.json tidak ditemukan');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function valid(value) {
  return Number.isFinite(value) && value > 0;
}

function average(values) {
  const filtered = values.filter(valid);
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function median(values) {
  const filtered = values.filter(valid).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const middle = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[middle] : (filtered[middle - 1] + filtered[middle]) / 2;
}

function medianNumber(values) {
  const filtered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const middle = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[middle] : (filtered[middle - 1] + filtered[middle]) / 2;
}

function percentChange(current, previous) {
  return previous ? Number(((current - previous) / previous * 100).toFixed(1)) : null;
}

function monthName(month) {
  return month ? MONTHS_FULL[month - 1] : '-';
}

function analyzeCommodity(commodity, info) {
  const prices = info.prices || {};
  const imputed = info.imputed || {};
  const dates = Object.keys(prices).sort();
  const monthlyDays = {};
  const monthlyValues = {};
  const years = new Set();
  let observedDays = 0;
  let imputedDays = 0;

  for (const date of dates) {
    const flags = imputed[date] || [];
    const values = (Array.isArray(prices[date]) ? prices[date] : [])
      .filter((value, index) => valid(value) && !flags[index]);
    const hasImputed = flags.some(Boolean);
    if (hasImputed) imputedDays++;
    if (!values.length) continue;

    observedDays++;
    const yearMonth = date.slice(0, 7);
    const year = yearMonth.slice(0, 4);
    years.add(year);
    if (!monthlyDays[yearMonth]) monthlyDays[yearMonth] = [];
    monthlyDays[yearMonth].push(Math.round(average(values)));
  }

  for (const [yearMonth, values] of Object.entries(monthlyDays)) {
    monthlyValues[yearMonth] = Math.round(average(values));
  }

  const averageByMonth = {};
  const medianByMonth = {};
  const samplesByMonth = {};
  for (let month = 1; month <= 12; month++) {
    const values = Object.entries(monthlyValues)
      .filter(([yearMonth]) => Number(yearMonth.slice(5, 7)) === month)
      .map(([, value]) => value);
    averageByMonth[month] = values.length ? Math.round(average(values)) : null;
    medianByMonth[month] = values.length ? Math.round(median(values)) : null;
    samplesByMonth[month] = values.length;
  }

  const changes = {};
  for (let month = 1; month <= 12; month++) {
    const previousMonth = month === 1 ? 12 : month - 1;
    if (medianByMonth[month] != null && medianByMonth[previousMonth] != null) {
      changes[month] = percentChange(medianByMonth[month], medianByMonth[previousMonth]);
    }
  }

  const yearlyChanges = {};
  for (const [yearMonth, current] of Object.entries(monthlyValues)) {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(5, 7));
    const previousKey = month === 1
      ? `${year - 1}-12`
      : `${year}-${String(month - 1).padStart(2, '0')}`;
    const previous = monthlyValues[previousKey];
    if (previous == null) continue;
    if (!yearlyChanges[month]) yearlyChanges[month] = [];
    yearlyChanges[month].push(percentChange(current, previous));
  }

  const consistency = {};
  for (let month = 1; month <= 12; month++) {
    const changesForMonth = (yearlyChanges[month] || []).filter(value => value != null);
    const rising = changesForMonth.filter(value => value > 0).length;
    const falling = changesForMonth.filter(value => value < 0).length;
    consistency[month] = {
      samples: changesForMonth.length,
      rising,
      falling,
      risingRate: changesForMonth.length ? Number((rising / changesForMonth.length * 100).toFixed(1)) : null,
      medianChange: changesForMonth.length ? Number(medianNumber(changesForMonth).toFixed(1)) : null
    };
  }

  const availableMonths = Object.entries(medianByMonth).filter(([, value]) => value != null);
  if (!availableMonths.length) {
    return {
      columns: info.columns || [], dataDays: dates.length, observedDays, imputedDays,
      averageByMonth, medianByMonth, samplesByMonth, perubahan: changes,
      consistency, bulanNaik: [], bulanTurun: [], terendah: null, tertinggi: null,
      recommendation: null, recent: null, yoy: {}
    };
  }

  const lowest = availableMonths.reduce((best, item) => item[1] < best[1] ? item : best);
  const highest = availableMonths.reduce((best, item) => item[1] > best[1] ? item : best);
  const risingMonths = Object.entries(changes)
    .filter(([, value]) => value > 2)
    .map(([month, pct]) => ({ bulan: Number(month), pct }))
    .sort((a, b) => b.pct - a.pct);
  const fallingMonths = Object.entries(changes)
    .filter(([, value]) => value < -2)
    .map(([month, pct]) => ({ bulan: Number(month), pct }))
    .sort((a, b) => a.pct - b.pct);

  const recentKeys = Object.keys(monthlyValues).sort().slice(-12);
  const recent = recentKeys.length >= 2
    ? {
        from: recentKeys[0],
        to: recentKeys[recentKeys.length - 1],
        change: percentChange(monthlyValues[recentKeys[recentKeys.length - 1]], monthlyValues[recentKeys[0]])
      }
    : null;

  const latestYear = Math.max(...Object.keys(monthlyValues).map(key => Number(key.slice(0, 4))));
  const yoy = {};
  for (let month = 1; month <= 12; month++) {
    const current = monthlyValues[`${latestYear}-${String(month).padStart(2, '0')}`];
    const previous = monthlyValues[`${latestYear - 1}-${String(month).padStart(2, '0')}`];
    if (current != null && previous != null) yoy[month] = percentChange(current, previous);
  }

  const highestMonth = Number(highest[0]);
  const lowestMonth = Number(lowest[0]);
  const momentumUp = risingMonths[0] || null;
  const momentumDown = fallingMonths[0] || null;
  const coverage = years.size ? Number((samplesByMonth[highestMonth] / years.size * 100).toFixed(1)) : 0;

  return {
    columns: info.columns || [],
    dataDays: dates.length,
    observedDays,
    imputedDays,
    averageByMonth,
    medianByMonth,
    samplesByMonth,
    rataRata: averageByMonth,
    perubahan: changes,
    consistency,
    bulanNaik: risingMonths,
    bulanTurun: fallingMonths,
    terendah: { bulan: lowestMonth, harga: lowest[1] },
    tertinggi: { bulan: highestMonth, harga: highest[1] },
    recommendation: {
      sellMonth: highestMonth,
      lowMonth: lowestMonth,
      momentumUp,
      momentumDown,
      coverage
    },
    recent,
    yoy
  };
}

function buildAnalysis(data) {
  const commodities = {};
  for (const [commodity, info] of Object.entries(data.commodities || {})) {
    commodities[commodity] = analyzeCommodity(commodity, info);
  }
  return commodities;
}

function writeOutput(analysis) {
  const output = { generatedAt: new Date().toISOString(), summary: {}, commodities: analysis };
  for (const [commodity, info] of Object.entries(analysis)) {
    output.summary[commodity] = {
      bestMonth: info.recommendation?.sellMonth || null,
      worstMonth: info.recommendation?.lowMonth || null,
      momentumUpMonth: info.recommendation?.momentumUp?.bulan || null,
      momentumDownMonth: info.recommendation?.momentumDown?.bulan || null,
      confidence: info.recommendation?.coverage || 0,
      dataDays: info.dataDays,
      observedDays: info.observedDays,
      imputedDays: info.imputedDays,
      terendah: info.terendah,
      tertinggi: info.tertinggi
    };
  }

  const outputPath = path.join(__dirname, '..', 'data', 'analisa.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  return output;
}

const data = loadData();
const analysis = buildAnalysis(data);
const output = writeOutput(analysis);

console.log('✅ Analisa tersimpan di data/analisa.json');
for (const [commodity, info] of Object.entries(output.summary)) {
  console.log(`  ${commodity}: jual ${monthName(info.bestMonth)}, harga rendah ${monthName(info.worstMonth)}, momentum naik ${monthName(info.momentumUpMonth)}`);
}
