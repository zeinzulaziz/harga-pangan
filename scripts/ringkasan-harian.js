#!/usr/bin/env node
// Membangun payload notifikasi Discord dari data harian.
// Output: JSON webhook body (stdout). Exit 0 selalu.
'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const prod = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'produsen.json'), 'utf8'));
const ana  = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'analisa.json'), 'utf8'));

const today = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'full'
}).format(new Date());

function formatRupiah(v) {
  return v == null ? '—' : Number(v).toLocaleString('id-ID');
}

const rows = Object.entries(prod.commodities).map(([nama, c]) => {
  const dates = Object.keys(c.prices || {}).sort();
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  const values = lastDate ? (c.prices[lastDate] || []) : [];
  const firstIdx = c.columns.findIndex((_, i) => values[i] != null);
  const val = firstIdx >= 0 ? values[firstIdx] : null;
  const rec = ana.commodities?.[nama]?.recommendation || {};
  return [
    nama,
    `Rp ${formatRupiah(val)}`,
    `jual ${rec.sellMonth ?? '—'}`,
    `beli ${rec.lowMonth ?? '—'}`,
    `momentum ${rec.momentumUp ?? '—'}`
  ].join(' | ');
}).join('\n');

const payload = {
  content: '📊 Scrap harian selesai',
  embeds: [{
    title: 'Harian Harga Produsen Jatim',
    description: `Terakhir update: ${prod.lastUpdate.slice(0, 10)}\n${rows}`,
    color: 0x2E7D32,
    footer: { text: 'Sumber: SISKAPERBAPO Jatim' }
  }]
};

process.stdout.write(JSON.stringify(payload));
