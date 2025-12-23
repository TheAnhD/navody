/*
 * pdf.js - label PDF generator
 * Exports: generatePdfForProduct(product, template) -> Promise<{path, sample}>
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
let fontkit = null;
try { fontkit = require('@pdf-lib/fontkit'); } catch (e) { fontkit = null; }

function mmToPoints(mm) { return (mm / 25.4) * 72; }

async function findAndEmbedFont(pdfDoc) {
	const candidates = [
		path.join(__dirname, 'assets', 'fonts', 'NotoSans-Regular.ttf'),
		path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf'),
		path.join(__dirname, 'assets', 'fonts', 'DejaVuSans.ttf'),
		'/Library/Fonts/Arial Unicode.ttf',
		'/Library/Fonts/DejaVuSans.ttf'
	];
	for (const p of candidates) {
		try {
			if (fs.existsSync(p)) {
				const bytes = fs.readFileSync(p);
				if (!fontkit) throw new Error('Install @pdf-lib/fontkit to embed TTF fonts');
				pdfDoc.registerFontkit(fontkit);
				const font = await pdfDoc.embedFont(bytes);
				return { font, path: p };
			}
		} catch (e) {
			// ignore and try next
		}
	}
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	return { font, path: null };
}

function wrapTextToWidth(font, text, size, maxWidth) {
	const words = String(text || '').split(/\s+/).filter(Boolean);
	const lines = [];
	let cur = '';
	for (const w of words) {
		const test = cur ? (cur + ' ' + w) : w;
		if (font.widthOfTextAtSize(test, size) <= maxWidth) { cur = test; }
		else {
			if (cur) lines.push(cur);
			if (font.widthOfTextAtSize(w, size) > maxWidth) {
				let acc = '';
				for (const ch of w) {
					const t = acc + ch;
					if (font.widthOfTextAtSize(t, size) <= maxWidth) acc = t;
					else { if (acc) lines.push(acc); acc = ch; }
				}
				if (acc) cur = acc; else cur = '';
			} else { cur = w; }
		}
	}
	if (cur) lines.push(cur);
	return lines;
}

async function generatePdfForProduct(product, template) {
	const pageSize = (template && template.pageSize) || 'A4';
	const pageWidth = pageSize === 'A4' ? mmToPoints(210) : mmToPoints(210);
	const pageHeight = pageSize === 'A4' ? mmToPoints(297) : mmToPoints(297);

	const labelWidthMm = Number(template && template.labelWidthMm || 50);
	const labelHeightMm = Number(template && template.labelHeightMm || 20);
	const cols = Math.max(1, parseInt(template && template.cols || '3', 10));
	const rows = Math.max(1, parseInt(template && template.rows || '8', 10));
	const marginMm = Number(template && template.marginMm || 5);
	let baseFontSize = Number(template && template.fontSize || 10);
	const pageTopOffsetMm = Number(template && template.pageTopOffsetMm || 0);
	const pageLeftOffsetMm = Number(template && template.pageLeftOffsetMm || 0);
	const hGapMm = Number(template && template.hGapMm || 0);
	const vGapMm = Number(template && template.vGapMm || 0);

	const labelW = mmToPoints(labelWidthMm);
	const labelH = mmToPoints(labelHeightMm);
	const margin = mmToPoints(marginMm);
	const pageTopOffset = mmToPoints(pageTopOffsetMm);
	const pageLeftOffset = mmToPoints(pageLeftOffsetMm);
	const hGap = mmToPoints(hGapMm);
	const vGap = mmToPoints(vGapMm);

	if (!isFinite(labelW) || !isFinite(labelH) || labelW <= 0 || labelH <= 0) throw new Error('Invalid label dimensions');

	const pdfDoc = await PDFDocument.create();
	const page = pdfDoc.addPage([pageWidth, pageHeight]);

	const { font, path: fontPath } = await findAndEmbedFont(pdfDoc);
	if (!fontPath) {
		const txt = (product.name || '') + '\n' + (product.text_body || '');
		if (/[^\u0000-\u007f]/.test(txt)) throw new Error('Non-ASCII characters detected but no TTF font found. Place a TTF in assets/fonts and install @pdf-lib/fontkit.');
	}

		// Compose full text: ensure the product name appears first as plain text (not larger font)
		const nameText = String(product.name || '').trim();
		let fullText = String(product.text_body || '').trim();
		if (nameText) {
			// if the body already contains the name but not at the start, still ensure name is first
			const low = fullText.toLowerCase();
			const nameLow = nameText.toLowerCase();
			if (!low.startsWith(nameLow)) {
				// prepend name to the body so it appears before 'Složení' and other content
				fullText = nameText + '\n' + fullText;
			}
		}

	const results = [];
	const availableInnerW = labelW - mmToPoints(2);
	const availableInnerH = labelH - mmToPoints(2);
	const minFontSize = 4;

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = pageLeftOffset + margin + c * (labelW + hGap);
			const y = pageHeight - pageTopOffset - margin - (r + 1) * labelH - r * vGap;

									// Wrap name separately and render it first (same base font size), then body below.
									// Ensure bodyText does not contain any leading copies of the product name (avoid duplication).
									const nameTextLocal = nameText || '';
									let bodyText = String(product.text_body || '').trim();
									try {
										const ft = String(fullText || (product.text_body || '')).trim();
										// Normalize function: remove diacritics and case for robust comparisons
										const normalize = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
										if (nameTextLocal) {
											// split into lines and drop any leading lines that equal the name (possibly repeated)
											const lines = ft.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
											while (lines.length && normalize(lines[0]) === normalize(nameTextLocal)) {
												lines.shift();
											}
											bodyText = lines.join('\n').trim();
										} else {
											bodyText = ft;
										}
									} catch (e) {
										bodyText = String(product.text_body || '').trim();
									}
			let usedSize = baseFontSize;
			let nameLines = [];
			let bodyLines = [];
			// Try decreasing size until the full name + full body fits inside the label
			// allow shrinking down to a low safety floor so long texts can still be rendered
			const minPossibleSize = 2;
			const lineHeightFactor = 1.12;
			while (true) {
				nameLines = nameTextLocal ? wrapTextToWidth(font, nameTextLocal, usedSize, availableInnerW - mmToPoints(2)) : [];
				bodyLines = bodyText ? wrapTextToWidth(font, bodyText, usedSize, availableInnerW - mmToPoints(2)) : [];
				const nameH = nameLines.length * usedSize * lineHeightFactor + (nameLines.length ? usedSize * 0.2 : 0);
				const bodyH = bodyLines.length * usedSize * lineHeightFactor;
				if (nameH + bodyH <= availableInnerH) {
					break; // everything fits
				}
				if (usedSize <= minPossibleSize) {
					// As a last resort, scale down proportionally to try to fit
					const scale = availableInnerH / Math.max(1, (nameH + bodyH));
					usedSize = Math.max(minPossibleSize, usedSize * scale);
					// recompute wrapped lines with new fractional size
					nameLines = nameTextLocal ? wrapTextToWidth(font, nameTextLocal, usedSize, availableInnerW - mmToPoints(2)) : [];
					bodyLines = bodyText ? wrapTextToWidth(font, bodyText, usedSize, availableInnerW - mmToPoints(2)) : [];
					break;
				}
				usedSize = Math.max(minPossibleSize, usedSize - 1);
			}

			// Build renderLines: include all name + body lines (no truncation) using computed usedSize
			const topPadding = mmToPoints(1);
			let accH = 0;
			let renderLines = [];
			// Add name lines first (if any)
			for (const ln of nameLines) {
				renderLines.push({ text: ln, size: usedSize, isName: true });
				accH += usedSize * lineHeightFactor;
			}
			// Add all body lines; since we ensured they fit, we don't truncate
			for (const ln of bodyLines) {
				renderLines.push({ text: ln, size: usedSize, isName: false });
				accH += usedSize * lineHeightFactor;
			}

			// Align to top inside the label
			const topY = y + labelH - topPadding;
			let offset = 0;
			for (const ln of renderLines) {
				const w = font.widthOfTextAtSize(ln.text, ln.size);
				const tx = x + (labelW - w) / 2;
				// draw baseline at topY minus accumulated offset and line size
				const ty = topY - offset - ln.size;
				page.drawText(ln.text, { x: tx, y: ty, size: ln.size, font, color: rgb(0, 0, 0) });
				offset += ln.size * 1.12;
			}

			if (r === 0 && c === 0) results.push({ sample: renderLines.slice(0, 6) });
		}
	}

	const pdfBytes = await pdfDoc.save();
	const tmpPath = path.join(os.tmpdir(), `navody_${Date.now()}.pdf`);
	fs.writeFileSync(tmpPath, pdfBytes);
	return { path: tmpPath, sample: results[0] };
}

module.exports = { generatePdfForProduct };
