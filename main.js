const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

class MainApp {
	constructor() {
		this.win = null;
	}

	createWindow() {
		this.win = new BrowserWindow({
			width: 1000,
			height: 700,
			minWidth: 980,
			minHeight: 560,
			webPreferences: {
				preload: path.join(__dirname, 'preload.js')
			}
		});
		this.win.loadFile('index.html');
	}

	setupAppLifecycle() {
		app.whenReady().then(() => {
			this.createWindow();
			app.on('activate', () => {
				if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
			});
		});

		app.on('window-all-closed', () => {
			if (process.platform !== 'darwin') app.quit();
		});
	}

	setupIpcHandlers() {
		ipcMain.handle('db-insert-product', async (event, product) => {
			const db = require('./db');
			return db.insertProduct(product);
		});

		ipcMain.handle('db-search-products', async (event, query) => {
			const db = require('./db');
			// query may be string or { q, limit, offset }
			if (query && typeof query === 'object' && (query.q !== undefined)) {
				return db.searchProducts(query.q || '', query.limit || 1000, query.offset || 0);
			}
			return db.searchProducts(query || '', 1000, 0);
		});

		ipcMain.handle('db-update-product', async (event, payload) => {
			const db = require('./db');
			return db.updateProduct(payload);
		});

		ipcMain.handle('db-delete-product', async (event, id) => {
			const db = require('./db');
			return db.deleteProduct(id);
		});

		ipcMain.handle('generate-pdf', async (event, { productId, template }) => {
			const db = require('./db');
			const pdfGen = require('./pdf');
			const product = await db.getProductById(productId);
			console.log('generate-pdf called for productId:', productId, 'product:', product);
			if (!product) {
				await dialog.showMessageBox({ type: 'error', message: 'Product not found' });
				throw new Error('Product not found');
			}
			const result = await pdfGen.generatePdfForProduct(product, template);
			// pdf generator may return either a string path or an object { path, ... }
			const pdfPath = (typeof result === 'string') ? result : (result && result.path) ? result.path : null;
			if (!pdfPath) {
				await dialog.showMessageBox({ type: 'error', message: 'PDF generation failed: no path returned' });
				throw new Error('PDF generation failed: no path returned');
			}
			try {
				const openResult = await shell.openPath(pdfPath);
				console.log('shell.openPath result:', openResult);
				if (openResult) {
					await dialog.showMessageBox({ type: 'error', message: 'Failed to open PDF: ' + openResult });
				}
			} catch (err) {
				console.error('Error opening PDF from main:', err);
				await dialog.showMessageBox({ type: 'error', message: 'Error opening PDF: ' + err.message });
			}
			return pdfPath;
		});

		ipcMain.handle('open-path', async (event, filePath) => {
			try {
				const res = await shell.openPath(filePath);
				console.log('open-path result:', res);
				return res;
			} catch (err) {
				console.error('open-path error:', err);
				throw err;
			}
		});

		// Safe file delete: normalizes file:// URLs and attempts fs.rm, then falls back to shell.trashItem
		const { fileURLToPath } = require('url');

		async function normalizeToPath(p) {
			if (!p) throw new Error('Missing path');
			if (typeof p === 'string' && p.startsWith('file://')) return fileURLToPath(p);
			return p;
		}

		async function safeDelete(p) {
			p = await normalizeToPath(p);
			try {
				// attempt to remove file (force avoids error if missing)
				await fs.promises.rm(p, { force: true, maxRetries: 2 });
				return { ok: true, method: 'rm' };
			} catch (err) {
				console.warn('fs.rm failed, trying trashItem for', p, err && err.message);
				try {
					await shell.trashItem(p);
					return { ok: true, method: 'trash' };
				} catch (err2) {
					throw new Error(`Failed to delete ${p}: ${err.message}; trash error: ${err2 && err2.message}`);
				}
			}
		}

		ipcMain.handle('delete-file', async (event, filePath) => {
			return safeDelete(filePath);
		});

		// Process multiple PDF files and send progress events
		ipcMain.handle('process-pdf-files', async (event, filePaths) => {
			const proc = require('./process_pdfs');
			// process_pdfs exports a function processFiles when required as module
			if (typeof proc.processFiles === 'function') {
				return proc.processFiles(filePaths, (progress) => {
					event.sender.send('process-pdf-progress', progress);
				});
			} else {
				// fallback: call processFile for each path
				const results = [];
				for (const p of filePaths) {
					try {
						const r = await proc.processFile(p);
						results.push(r);
						event.sender.send('process-pdf-progress', { file: p, status: 'done', result: r });
					} catch (err) {
						results.push(null);
						event.sender.send('process-pdf-progress', { file: p, status: 'error', error: err.message });
					}
				}
				return results;
			}
		});

		ipcMain.handle('show-open-dialog', async (event) => {
			const res = await dialog.showOpenDialog({
				properties: ['openFile', 'multiSelections'],
			tfilters: [{ name: 'PDF', extensions: ['pdf'] }]
			});
			return res.filePaths || [];
		});
	}

	run() {
		this.setupAppLifecycle();
		this.setupIpcHandlers();
	}
}

// Instantiate and export. Only run if this script is executed directly by Electron
const mainApp = new MainApp();
if (require.main === module) {
	mainApp.run();
}

module.exports = mainApp;