const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

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
		// Hide the native menu bar and clear the app menu so shortcuts don't show the menu
		try {
			Menu.setApplicationMenu(null);
			this.win.setMenuBarVisibility(false);
			this.win.autoHideMenuBar = true;
		} catch (e) { console.debug('Menu hide failed', e && e.message); }
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
				const senderWin = BrowserWindow.fromWebContents(event.sender) || this.win;
				console.log('generate-pdf: product not found, showing error dialog');
				await dialog.showMessageBox(senderWin, { type: 'error', message: 'Product not found' });
				restoreFocus(senderWin, 8, 150, 'product-not-found');
				setTimeout(() => restoreFocus(senderWin, 6, 200, 'product-not-found-delayed'), 300);
				throw new Error('Product not found');
			}
			const result = await pdfGen.generatePdfForProduct(product, template);
			// pdf generator may return either a string path or an object { path, ... }
			const pdfPath = (typeof result === 'string') ? result : (result && result.path) ? result.path : null;
			if (!pdfPath) {
				const senderWin = BrowserWindow.fromWebContents(event.sender) || this.win;
				console.log('generate-pdf: no pdfPath returned, showing error dialog');
				await dialog.showMessageBox(senderWin, { type: 'error', message: 'PDF generation failed: no path returned' });
				restoreFocus(senderWin, 8, 150, 'no-pdf-path');
				setTimeout(() => restoreFocus(senderWin, 6, 200, 'no-pdf-path-delayed'), 300);
				throw new Error('PDF generation failed: no path returned');
			}
			try {
				const openResult = await shell.openPath(pdfPath);
				console.log('shell.openPath result:', openResult);
				// restore focus after launching external viewer
				try { setTimeout(() => restoreFocus(BrowserWindow.fromWebContents(event.sender) || this.win, 6, 150, 'openpath-after-open'), 200); } catch (e) {}
				if (openResult) {
					const senderWin = BrowserWindow.fromWebContents(event.sender) || this.win;
					console.log('generate-pdf: shell.openPath returned error, showing dialog:', openResult);
					await dialog.showMessageBox(senderWin, { type: 'error', message: 'Failed to open PDF: ' + openResult });
					restoreFocus(senderWin, 8, 150, 'failed-open');
					setTimeout(() => restoreFocus(senderWin, 6, 200, 'failed-open-delayed'), 300);
				}
			} catch (err) {
				console.error('Error opening PDF from main:', err);
				const senderWin = BrowserWindow.fromWebContents(event.sender) || this.win;
				console.error('generate-pdf: error opening PDF, showing dialog:', err && err.message);
				await dialog.showMessageBox(senderWin, { type: 'error', message: 'Error opening PDF: ' + err.message });
				restoreFocus(senderWin, 8, 150, 'error-open-exception');
				try { setTimeout(() => restoreFocus(BrowserWindow.fromWebContents(event.sender) || this.win, 6, 150, 'error-open-exception-delayed'), 200); } catch (e) {}
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

		// Helper to restore focus to a BrowserWindow with retries (addresses flaky Windows focus behavior)
		function restoreFocus(win, attempts = 8, delay = 150, tag = '') {
			if (!win) return;
			let i = 0;
			console.debug(`restoreFocus start${tag ? ' (' + tag + ')' : ''}: attempts=${attempts} delay=${delay}`);
			const t = setInterval(() => {
				if (!win || win.isDestroyed()) return clearInterval(t);
				try {
					win.focus();
					console.debug(`restoreFocus focus called${tag ? ' (' + tag + ')' : ''} attempt=${i+1}`);
				} catch (e) {
					console.debug('restoreFocus focus error', e && e.message);
				}
				if (++i >= attempts) {
					clearInterval(t);
					console.debug(`restoreFocus done${tag ? ' (' + tag + ')' : ''}`);
					// Last-resort: toggle alwaysOnTop to force window to front on stubborn platforms
					try {
						console.debug('restoreFocus: toggling alwaysOnTop as last resort' + (tag ? ' (' + tag + ')' : ''));
						win.setAlwaysOnTop(true);
						win.focus();
						setTimeout(() => {
							try { win.setAlwaysOnTop(false); } catch (e) { console.debug('restoreFocus: setAlwaysOnTop(false) failed', e && e.message); }
						}, 60);
					} catch (e) {
						console.debug('restoreFocus alwaysOnTop toggle failed', e && e.message);
					}
				}
			}, delay);
		}

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

		// Toggle DevTools for debugging (renderer can call via preload API)
		ipcMain.handle('toggle-devtools', async (event) => {
			const senderWin = BrowserWindow.fromWebContents(event.sender) || this.win;
			try {
				if (senderWin && senderWin.webContents) {
					senderWin.webContents.toggleDevTools();
					return { ok: true };
				}
			} catch (e) {
				console.debug('toggle-devtools failed', e && e.message);
			}
			return { ok: false };
		});

		ipcMain.handle('show-open-dialog', async (event) => {
			// Parent the dialog to the sender window so it behaves modally on Windows
			const senderWin = BrowserWindow.fromWebContents(event.sender) || this.win;
			const res = await dialog.showOpenDialog(senderWin, {
				properties: ['openFile', 'multiSelections'],
				filters: [{ name: 'PDF', extensions: ['pdf'] }]
			});
			// restore focus to the window after dialog closes (helps with some Windows focus issues)
			try { restoreFocus(senderWin); } catch (e) {}
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