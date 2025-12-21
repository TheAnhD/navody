const fs = require('fs');
const path = require('path');
const db = require('../db');

function normalizeText(s){ return String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim(); }

(async()=>{
  await db.init();
  const res = db.db.exec('SELECT id, ean, name, text_body FROM products');
  if(!res || !res[0] || !res[0].values) return console.log('no products');
  const cols = res[0].columns;
  const rows = res[0].values.map(v=>{ const o={}; cols.forEach((c,i)=>o[c]=v[i]); return o; });
  const outDir = path.join(__dirname,'..','samples','texts');
  const bySanitizedEan = new Map();
  const actions = { updated: [], merged: [], renamedFiles: [], deletedFiles: [], trimmedEan: [] };

  for(const r of rows){
    const rawEan = String(r.ean || '');
    const trimmed = rawEan.trim();
    const sanitized = trimmed;
    // If EAN differs (leading/trailing spaces), try to normalize
    if (sanitized !== rawEan) {
      // see if a row already exists for sanitized
      const key = sanitized;
      if (key && bySanitizedEan.has(key)) {
        // merge r into existing
        const target = bySanitizedEan.get(key);
        // choose name (prefer target.name)
        const newName = target.name || r.name;
        // merge text bodies (prefer longer)
        const tb1 = String(target.text_body||'');
        const tb2 = String(r.text_body||'');
        const mergedText = tb1.length >= tb2.length ? tb1 : tb2;
        // update target if needed
        if (mergedText !== tb1 || newName !== target.name) {
          await db.updateProduct({ id: target.id, name: newName, text_body: mergedText });
          actions.updated.push({ id: target.id, reason: 'merged from '+r.id });
        }
        // delete current r
        await db.deleteProduct(r.id);
        actions.merged.push({ from: r.id, to: target.id, ean: key });
        // remove file for r.ean if exists
        const oldFile = path.join(outDir, rawEan + '.txt');
        if (fs.existsSync(oldFile)) { fs.unlinkSync(oldFile); actions.deletedFiles.push(oldFile); }
      } else if (key) {
        // no existing target, update r.ean to sanitized
        try { await db.updateProductEan({ id: r.id, ean: sanitized }); actions.trimmedEan.push({ id: r.id, before: rawEan, after: sanitized });
          // rename file if exists
          const oldFile = path.join(outDir, rawEan + '.txt');
          const newFile = path.join(outDir, sanitized + '.txt');
          if (fs.existsSync(oldFile)) {
            if (!fs.existsSync(newFile)) {
              fs.renameSync(oldFile, newFile);
              actions.renamedFiles.push({ from: oldFile, to: newFile });
            } else {
              // conflict: remove old
              fs.unlinkSync(oldFile);
              actions.deletedFiles.push(oldFile);
            }
          }
          bySanitizedEan.set(key, { id: r.id, ean: sanitized, name: r.name, text_body: r.text_body });
        } catch(e){ console.error('failed updateProductEan', r.id, e.message); }
      }
    } else {
      // ean already trimmed; register
      if (sanitized) {
        if (!bySanitizedEan.has(sanitized)) bySanitizedEan.set(sanitized, { id: r.id, ean: sanitized, name: r.name, text_body: r.text_body });
        else {
          // duplicate exact ean found; merge
          const target = bySanitizedEan.get(sanitized);
          const tb1 = String(target.text_body||'');
          const tb2 = String(r.text_body||'');
          const mergedText = tb1.length >= tb2.length ? tb1 : tb2;
          const newName = target.name || r.name;
          if (mergedText !== tb1 || newName !== target.name) {
            await db.updateProduct({ id: target.id, name: newName, text_body: mergedText });
            actions.updated.push({ id: target.id, reason: 'merged from '+r.id });
          }
          await db.deleteProduct(r.id);
          actions.merged.push({ from: r.id, to: target.id, ean: sanitized });
          const oldFile = path.join(outDir, r.ean + '.txt');
          if (fs.existsSync(oldFile)) { fs.unlinkSync(oldFile); actions.deletedFiles.push(oldFile); }
        }
      }
    }
  }

  // Pass 2: dedupe duplicated leading names in text_body for all remaining rows
  const res2 = db.db.exec('SELECT id, ean, name, text_body FROM products');
  const cols2 = res2 && res2[0] && res2[0].columns || [];
  const rows2 = res2 && res2[0] && res2[0].values ? res2[0].values.map(v=>{ const o={}; cols2.forEach((c,i)=>o[c]=v[i]); return o; }) : [];
  for(const r of rows2) {
    const tb = String(r.text_body || '');
    if (!tb) continue;
    const lines = tb.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const first = lines[0];
    // find if first line repeats immediately or within first 3 lines
    let changed = false;
    if (lines[1] && normalizeText(lines[1]) === normalizeText(first)) {
      lines.splice(1,1); changed = true;
    }
    // also collapse any repeated leading header tokens (e.g., "NANG FAH... NANG FAH...")
    // remove occurrences of first line anywhere if duplicated consecutively
    for (let i = lines.length - 1; i > 0; i--) {
      if (normalizeText(lines[i]) === normalizeText(lines[i-1]) && normalizeText(lines[i]) === normalizeText(first)) {
        lines.splice(i,1); changed = true;
      }
    }
    if (changed) {
      const newBody = lines.join('\n');
      try { await db.updateProduct({ id: r.id, name: r.name, text_body: newBody }); actions.updated.push({ id: r.id, reason: 'removed duplicated leading name' });
        // update file if exists
        const fp = path.join(outDir, r.ean + '.txt');
        if (fs.existsSync(fp)) fs.writeFileSync(fp, r.name + '\n' + newBody, 'utf8');
      } catch(e){ console.error('failed to update product', r.id, e.message); }
    }
  }

  console.log('actions summary:', actions);
  console.log('done');
})();
