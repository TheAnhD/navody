const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const database = require('./db');

// Simple dedupe: split into lines, trim, remove duplicates preserving order, join paragraphs
function dedupeText(text) {
  if (!text) return '';
  // Normalize newlines and collapse multiple spaces
  const rawLines = String(text).replace(/\r\n/g, '\n').split(/\n/).map(l => l.replace(/\s+/g, ' ').trim());
  const seen = new Set();
  const out = [];
  for (const line of rawLines) {
    if (!line) continue;
    // skip trivial short tokens
    if (line.length <= 2) continue;
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(line);
    }
  }
  return out.join('\n');
}

function chooseNameFromText(text, fileName) {
  const lines = String(text).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const letterRegex = /[\p{L}]/u; // any unicode letter

  // Prefer short heading-like lines near the top (<= 6 words and < 80 chars)
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.length < 4 || line.length > 90) continue;
    if (!letterRegex.test(line)) continue;
    const words = line.split(/\s+/).length;
    if (words > 12) continue;
    // prefer all-caps or Title Case or lines with punctuation that looks like a title
    if (/[A-ZÀ-Ý]/.test(line) || /[:\-–—]/.test(line) || words <= 8) {
      return line;
    }
  }

  // fallback: first line or filename
  return (lines.find(l => l.length > 0) || fileName).slice(0, 240);
}

async function processFile(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  try {
    const data = await pdf(dataBuffer);
    let raw = data.text || '';
    // Use deduped text for body and for line-level processing to avoid repeated blocks
    let text = dedupeText(raw);
    let nameFromText = null;
    const dedupedLines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const normalize = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    let sloIndex = -1;
    for (let i = 0; i < dedupedLines.length; i++) {
      const n = normalize(dedupedLines[i]);
      if (n.includes('slozeni') || n.includes('sloz')) { sloIndex = i; break; }
    }
    if (sloIndex >= 0) {
      let beforeLines = dedupedLines.slice(0, sloIndex);
      let afterLines = dedupedLines.slice(sloIndex);
      if (beforeLines.length > 0) nameFromText = beforeLines[0];
      // normalize duplicated header tokens in first after-line (e.g. 'složení: Složení:')
      if (afterLines.length > 0) {
        const first = afterLines[0];
        const firstNorm = normalize(first);
        // collapse multiple occurrences of 'slozeni' into a single header
        if ((firstNorm.match(/slozeni/g) || []).length > 1) {
          // keep only the part after the last colon
          const parts = first.split(':');
          const rest = parts.slice(-1)[0] || '';
          afterLines[0] = 'Složení: ' + rest.trim();
        }
      }
      // remove any lines in afterLines that are identical to the detected name (avoid duplication)
      if (nameFromText) {
        afterLines = afterLines.filter(l => normalize(l) !== normalize(nameFromText));
      }
      // remove duplicate lines while preserving order
      const seen = new Set();
      const uniq = [];
      for (const l of afterLines) {
        const key = l;
        if (!seen.has(key)) { seen.add(key); uniq.push(l); }
      }
      // collapse into single line body
      text = uniq.join(' ').replace(/\s+/g, ' ').trim();
    }
  // ensure output directory exists
  const outDir = path.join(__dirname, 'samples', 'texts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const fileName = path.basename(filePath, path.extname(filePath));
    const ean = fileName;
    // Choose a name from the deduped text using a small heuristic, fallback to filename
  const name = nameFromText || chooseNameFromText(text, fileName);
    // Save text with the name prepended so exported .txt and DB text_body contain the name as first line
    // remove any occurrences of the name from the body (normalized match) to avoid duplication
    const normalizeForCompare = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    const bodyLines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    // drop leading lines that repeat the name or are identical to filename
    while (bodyLines.length && (normalizeForCompare(bodyLines[0]) === normalizeForCompare(name) || normalizeForCompare(bodyLines[0]) === normalizeForCompare(ean))) {
      bodyLines.shift();
    }
    const filtered = bodyLines.filter(l => normalizeForCompare(l) !== normalizeForCompare(name));
    const cleanedBody = filtered.join('\n').trim().replace(/\n{2,}/g, '\n');
    const savedText = (name ? String(name).trim() + "\n" : "") + cleanedBody;
    // override text variable so later logic uses cleaned body if needed
    text = cleanedBody;

    // Idempotency: if a product with same EAN already exists, don't insert duplicate.
    try {
      const existing = await database.searchProducts(ean);
      const exact = existing && existing.find && existing.find(r => String(r.ean) === String(ean));
      if (exact) {
        console.log('Skipping insert, product with same EAN already exists:', exact.id, ean);
        // Optionally update text_body if different (include name)
        if (String(exact.text_body || '') !== String(savedText || '')) {
          try { await database.updateProduct({ id: exact.id, name: name || exact.name, text_body: savedText }); console.log('Updated existing product text_body for id', exact.id); exact.text_body = savedText; } catch(e){ /* ignore update errors */ }
        }
        return exact;
      }
    } catch (errCheck) {
      console.error('Error checking existing products for EAN', ean, errCheck && errCheck.message);
    }

    try {
      const res = await database.insertProduct({ name, ean, text_body: savedText });
      console.log('Inserted', res.id, name, ean);
      // write deduped text to a file named by the EAN
      try {
        const outPath = path.join(outDir, `${ean}.txt`);
        fs.writeFileSync(outPath, savedText, 'utf8');
        console.log('Wrote text file:', outPath);
      } catch (wfErr) {
        console.error('Failed to write text file for', filePath, wfErr.message);
      }
      return res;
    } catch (dbErr) {
      console.error('DB insert failed for', filePath, dbErr && dbErr.message);
      return null;
    }
  }
  catch (err) {
    console.error('Failed to process', filePath, err.message);
    return null;
  }
}

async function main() {
  const samplesDir = path.join(__dirname, 'samples');
  if (!fs.existsSync(samplesDir)) {
    console.error('samples directory not found:', samplesDir);
    process.exit(1);
  }
  const files = fs.readdirSync(samplesDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  if (files.length === 0) {
    console.log('No PDF files in samples/');
    return;
  }
  await database.init();
  for (const f of files) {
    const p = path.join(samplesDir, f);
    await processFile(p);
  }
}

async function processFiles(filePaths, progressCb) {
  await database.init();
  const results = [];
  // dedupe paths to avoid double-processing same file
  const unique = Array.from(new Set((filePaths || []).map(p => path.resolve(p))));
  for (const p of unique) {
    try {
      const r = await processFile(p);
      results.push(r);
      if (progressCb) progressCb({ file: p, status: 'done', result: r });
    } catch (err) {
      results.push(null);
      if (progressCb) progressCb({ file: p, status: 'error', error: err.message });
    }
  }
  return results;
}

// If run directly, process all PDFs in samples/
if (require.main === module) {
  main();
}

module.exports = { processFile, processFiles };
