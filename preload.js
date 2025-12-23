const { contextBridge, ipcRenderer } = require('electron');

class PreloadAPI {
	constructor() {
		this.api = {
			insertProduct: (product) => ipcRenderer.invoke('db-insert-product', product),
			searchProducts: (query, limit, offset) => ipcRenderer.invoke('db-search-products', (typeof query === 'string') ? { q: query, limit: limit, offset: offset } : query),
			updateProduct: (payload) => ipcRenderer.invoke('db-update-product', payload),
			deleteProduct: (id) => ipcRenderer.invoke('db-delete-product', id),
			deleteFile: (p) => ipcRenderer.invoke('delete-file', p),
			generatePdf: (opts) => ipcRenderer.invoke('generate-pdf', opts),
			openPath: (p) => ipcRenderer.invoke('open-path', p),
			processPdfFiles: (files) => ipcRenderer.invoke('process-pdf-files', files),
			onProcessPdfProgress: (cb) => {
				ipcRenderer.on('process-pdf-progress', (event, progress) => cb(progress));
			},
				showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
		};
		if (typeof contextBridge !== 'undefined' && contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
			contextBridge.exposeInMainWorld('api', this.api);
		}
	}
}

// initialize when loaded by Electron preload (guarded)
if (typeof contextBridge !== 'undefined' && contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
	new PreloadAPI();
}

module.exports = { PreloadAPI };
