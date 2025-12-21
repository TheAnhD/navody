const fs = require('fs');
const path = require('path');
const db = require('../db');

(async ()=>{
  await db.init();
  const res = db.db.exec('SELECT id, ean, name FROM products');
  if (!res || res.length === 0) return console.log('no rows');
  const cols = res[0].columns;
  const rows = res[0].values.map(v => {
    const o = {};
    cols.forEach((c, i) => o[c] = v[i]);
    return o;
  });

  const textsDir = path.join(__dirname, '..', 'samples', 'texts');
  const changes = [];
  const deletions = [];

  for (const r of rows) {
    const raw = (r.ean || '').toString();
    const trimmed = raw.trim();
    // remove common ' copy' suffixes (case-insensitive)
    const noCopy = trimmed.replace(/\s*copy\s*$/i, '').trim();
    // remove any surrounding quotes
    const cleaned = noCopy.replace(/^"|"$/g, '').trim();

    if (cleaned === raw) continue; // nothing to do

    // if cleaned is only digits, we'll update; otherwise skip but report
    if (/^\d+$/.test(cleaned)) {
      // check for collision
      const existing = db.db.exec('SELECT id FROM products WHERE ean = "' + cleaned + '"');
      let exists = false;
      if (existing && existing[0] && existing[0].values && existing[0].values.length) exists = true;
      if (exists) {
        deletions.push({ id: r.id, ean: r.ean, reason: 'conflict with existing ean ' + cleaned });
        // prefer to delete this conflicting row (it was probably the copy duplicate)
        try {
          db.db.run('DELETE FROM products WHERE id = ' + r.id);
          db.save();
        } catch (e) {
          console.error('failed to delete', r.id, e.message);
        }
      } else {
        await db.updateProductEan({ id: r.id, ean: cleaned });
        changes.push({ id: r.id, before: r.ean, after: cleaned });
        // also rename text file if exists
        const oldTxt = path.join(textsDir, (r.ean || '').toString() + '.txt');
        const newTxt = path.join(textsDir, cleaned + '.txt');
        try {
          if (fs.existsSync(oldTxt)) {
            fs.renameSync(oldTxt, newTxt);
          }
        } catch (e) {
          console.error('rename failed', oldTxt, newTxt, e.message);
        }
      }
    } else {
      // not purely digits after cleaning, skip but if it contains 'copy' we'll delete the row
      if (/copy/i.test(raw)) {
        deletions.push({ id: r.id, ean: r.ean, reason: 'contains copy and not sanitizable to digits' });
        try {
          db.db.run('DELETE FROM products WHERE id = ' + r.id);
          db.save();
        } catch (e) {
          console.error('failed to delete', r.id, e.message);
        }
      }
    }
  }

  console.log('updated:', changes.length, 'deleted:', deletions.length);
  console.log('updates sample:', changes.slice(0,20));
  console.log('deletions sample:', deletions.slice(0,20));

  // additionally, remove any text files in samples/texts that have ' copy' in filename
  if (fs.existsSync(textsDir)) {
    const files = fs.readdirSync(textsDir);
    const copyFiles = files.filter(f => /copy/i.test(f));
    for (const f of copyFiles) {
      try {
        fs.unlinkSync(path.join(textsDir, f));
      } catch (e) {
        console.error('failed to unlink', f, e.message);
      }
    }
    console.log('removed text files containing copy:', copyFiles.length);
  }

  console.log('done');
})();
