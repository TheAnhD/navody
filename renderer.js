// Wrap initialization to run after DOM is ready
window.addEventListener('DOMContentLoaded', () => {
	// Navigation
	const navButtons = document.querySelectorAll('.nav-btn');
	const sections = document.querySelectorAll('.section');
	navButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			const target = btn.dataset.target;
			sections.forEach(s => { s.classList.add('hidden'); });
			document.getElementById(target).classList.remove('hidden');
			// auto-refresh products list when showing it
			if (target === 'list') {
				const si = document.getElementById('searchInput');
				if (si) si.dispatchEvent(new Event('input'));
			}
		});
	});

	// Instantiate managers
	window.formatManager = new window.FormatManager();
	window.productManager = new window.ProductManager();

	// Modal basic controls
	const closeFormatModal = document.getElementById('closeFormatModal');
	const cancelFormatBtn = document.getElementById('cancelFormatBtn');
	if (closeFormatModal) closeFormatModal.addEventListener('click', () => {
		const fm = document.getElementById('formatModal');
		if (fm) {
			const box = fm.querySelector('.modal-box');
			if (box) box.classList.remove('format-modal');
			fm.classList.add('hidden');
		}
	});
	if (cancelFormatBtn) cancelFormatBtn.addEventListener('click', () => {
		const fm = document.getElementById('formatModal');
		if (fm) {
			const box = fm.querySelector('.modal-box');
			if (box) box.classList.remove('format-modal');
			fm.classList.add('hidden');
		}
	});

	const closeEditModal = document.getElementById('closeEditModal');
	const cancelEditBtn = document.getElementById('cancelEditBtn');
	if (closeEditModal) closeEditModal.addEventListener('click', () => document.getElementById('editModal').classList.add('hidden'));
	if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => document.getElementById('editModal').classList.add('hidden'));

	// Initial render
	window.formatManager.renderFormats();
	window.productManager.renderRecent();

	// initial products load if the list exists
	const searchInput = document.getElementById('searchInput');
	if (searchInput) searchInput.dispatchEvent(new Event('input'));

	// Import PDFs UI
	const pdfFilesInput = document.getElementById('pdfFilesInput');
	const importBtn = document.getElementById('importBtn');
	const importProgress = document.getElementById('importProgress');
	if (importBtn && importProgress) {
		let listenerRegistered = false;
		importBtn.addEventListener('click', async () => {
			importProgress.innerHTML = '';
			// Prefer native dialog to get real file paths
			const paths = await window.api.showOpenDialog();
			if (!paths || paths.length === 0) return alert('No files selected.');
			if (!listenerRegistered) {
				window.api.onProcessPdfProgress((progress) => {
					const line = document.createElement('div');
					line.className = 'import-line';
					line.textContent = `${progress.file} — ${progress.status}${progress.error ? ': ' + progress.error : ''}`;
					importProgress.appendChild(line);
				});
				listenerRegistered = true;
			}
			const res = await window.api.processPdfFiles(paths);
			console.log('process result', res);
			// refresh recent/products
			window.productManager.renderRecent();
		});
	}

	// auto-import feature removed; keep only manual import button above
});