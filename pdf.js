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
	// margin is intentionally ignored in placement; keep inner padding only
	const marginMm = 0; // template && template.marginMm is deprecated for placement
	let baseFontSize = Number(template && template.fontSize || 10);
	const pageTopOffsetMm = Number(template && template.pageTopOffsetMm || 0);
	const pageLeftOffsetMm = Number(template && template.pageLeftOffsetMm || 0);
	const hGapMm = Number(template && template.hGapMm || 0);
	const vGapMm = Number(template && template.vGapMm || 0);

	const labelW = mmToPoints(labelWidthMm);
	const labelH = mmToPoints(labelHeightMm);
	const margin = 0; // margin removed from layout calculations
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

	// Use a consistent inner padding inside each label and compute available area
	const innerPadding = mmToPoints(1); // 1mm padding on all sides
	const availableInnerW = Math.max(0, labelW - innerPadding * 2);
	const availableInnerH = Math.max(0, labelH - innerPadding * 2);
	const minFontSize = 4;
	const lineHeightFactor = 1.12;

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = pageLeftOffset + margin + c * (labelW + hGap);
			const y = pageHeight - pageTopOffset - margin - (r + 1) * labelH - r * vGap; // bottom of label

			// inner box (left/top coordinates for content)
			const innerLeft = x + innerPadding;
			const innerTop = y + labelH - innerPadding; // y coordinate at top of inner box

			// Prepare name and body text, removing duplicated leading name lines from body
			const nameTextLocal = nameText || '';
			let bodyText = String(product.text_body || '').trim();
			try {
				const ft = String(fullText || (product.text_body || '')).trim();
				const normalize = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
				if (nameTextLocal) {
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

			// Determine font size that fits into availableInnerH
			let usedSize = baseFontSize;
			let nameLines = [];
			let bodyLines = [];

			const minPossibleSize = minFontSize;
			while (true) {
				nameLines = nameTextLocal ? wrapTextToWidth(font, nameTextLocal, usedSize, availableInnerW) : [];
				bodyLines = bodyText ? wrapTextToWidth(font, bodyText, usedSize, availableInnerW) : [];
				const lineH = usedSize * lineHeightFactor;
				const nameH = nameLines.length * lineH + (nameLines.length ? usedSize * 0.2 : 0);
				const bodyH = bodyLines.length * lineH;
				if (nameH + bodyH <= availableInnerH) {
					break; // fits
				}
				if (usedSize <= minPossibleSize) {
					// scale proportionally as last resort
					const scale = availableInnerH / Math.max(1, (nameH + bodyH));
					usedSize = Math.max(minPossibleSize, usedSize * scale);
					// recompute lines for fractional size
					nameLines = nameTextLocal ? wrapTextToWidth(font, nameTextLocal, usedSize, availableInnerW) : [];
					bodyLines = bodyText ? wrapTextToWidth(font, bodyText, usedSize, availableInnerW) : [];
					break;
				}
				usedSize = Math.max(minPossibleSize, usedSize - 1);
			}

			// Build render lines and render within inner box
			const renderLines = [];
			for (const ln of nameLines) renderLines.push({ text: ln, size: usedSize, isName: true });
			for (const ln of bodyLines) renderLines.push({ text: ln, size: usedSize, isName: false });

			// Compute starting baseline: first line baseline should be innerTop - usedSize
			let baselineY = innerTop - usedSize;
			const lineH = usedSize * lineHeightFactor;

			for (const ln of renderLines) {
				const w = font.widthOfTextAtSize(ln.text, ln.size);
				// center horizontally inside inner area
				const tx = innerLeft + Math.max(0, (availableInnerW - w) / 2);
				const ty = baselineY; // drawText y is baseline
				page.drawText(ln.text, { x: tx, y: ty, size: ln.size, font, color: rgb(0, 0, 0) });
				baselineY -= lineH;
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
