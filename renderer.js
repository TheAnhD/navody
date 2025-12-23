// Wrap initialization to run after DOM is ready
window.addEventListener('DOMContentLoaded', () => {

	// Simple non-blocking toast so we avoid native alert() which can steal focus on Windows
	function showToast(message, opts = {}) {
		const root = document.body;
		let container = document.getElementById('navody_toast_container');
		if (!container) {
			container = document.createElement('div');
			container.id = 'navody_toast_container';
			container.style.position = 'fixed';
			container.style.bottom = '18px';
			container.style.right = '18px';
			container.style.zIndex = 99999;
			root.appendChild(container);
		}

		// expose for legacy/backup copies that may run in this renderer
		if (!window.showToast) window.showToast = showToast;
		const el = document.createElement('div');
		el.className = 'navody_toast';
		el.textContent = message;
		el.style.background = opts.background || 'rgba(2,6,23,0.88)';
		el.style.color = opts.color || '#fff';
		el.style.padding = '10px 14px';
		el.style.marginTop = '8px';
		el.style.borderRadius = '8px';
		el.style.boxShadow = '0 6px 20px rgba(2,6,23,0.45)';
		container.appendChild(el);
		setTimeout(() => { try { el.style.opacity = '0'; el.style.transition = 'opacity 240ms ease'; setTimeout(()=>el.remove(),300); } catch(e){} }, opts.duration || 3000);
	}

	// non-blocking confirm modal that returns a Promise<boolean>
	function showConfirm(message, opts = {}) {
		return new Promise((resolve) => {
			let overlay = document.getElementById('navody_confirm_overlay');
			if (!overlay) {
				overlay = document.createElement('div');
				overlay.id = 'navody_confirm_overlay';
				overlay.style.position = 'fixed';
				overlay.style.left = '0';
				overlay.style.top = '0';
				overlay.style.width = '100%';
				overlay.style.height = '100%';
				overlay.style.display = 'flex';
				overlay.style.alignItems = 'center';
				overlay.style.justifyContent = 'center';
				overlay.style.background = 'rgba(0,0,0,0.4)';
				overlay.style.zIndex = 100000;
				overlay.innerHTML = `
				<div style="background:#fff;color:#111;padding:18px;border-radius:10px;max-width:520px;box-shadow:0 8px 30px rgba(2,6,23,0.25);">
					<div style="margin-bottom:12px;white-space:pre-wrap;">${String(message).replace(/</g,'&lt;')}</div>
					<div style="text-align:right">
						<button id="navody_confirm_cancel" style="margin-right:8px;">${(opts.cancelText)||'Cancel'}</button>
						<button id="navody_confirm_ok">${(opts.okText)||'OK'}</button>
					</div>
				</div>`;
				document.body.appendChild(overlay);
				const okBtn = overlay.querySelector('#navody_confirm_ok');
				const cancelBtn = overlay.querySelector('#navody_confirm_cancel');
				const cleanup = (val) => {
					try { overlay.remove(); } catch(e){}
					resolve(Boolean(val));
				};
				okBtn.addEventListener('click', () => cleanup(true));
				cancelBtn.addEventListener('click', () => cleanup(false));
				// handle ESC
				document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); cleanup(false); } });
			} else {
				// overlay already exists; reuse it
				overlay.querySelector('div > div').textContent = message;
				const okBtn = overlay.querySelector('#navody_confirm_ok');
				const cancelBtn = overlay.querySelector('#navody_confirm_cancel');
				const cleanup = (val) => { try { overlay.remove(); } catch(e){} resolve(Boolean(val)); };
				okBtn.onclick = () => cleanup(true);
				cancelBtn.onclick = () => cleanup(false);
			}
		});
	}

	// expose for other modules
	if (!window.showConfirm) window.showConfirm = showConfirm;

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

	// Simple i18n: load locale files and replace data-i18n attributes
	const i18n = { current: 'en', messages: {} };

	async function loadLocale(code) {
		if (i18n.messages[code]) return i18n.messages[code];
		try {
			// Prefer fetch but fall back to embedded locales (window._LOCALES) if running from file:// or packaged app
			try {
				const res = await fetch(`locales/${code}.json`);
				if (res && res.ok) {
					const json = await res.json();
					i18n.messages[code] = json;
					return json;
				}
			} catch (fetchErr) {
				// ignore fetch error and fall back
			}
			if (window && window._LOCALES && window._LOCALES[code]) {
				i18n.messages[code] = window._LOCALES[code];
				return i18n.messages[code];
			}
			throw new Error('locale not found');
		} catch (e) {
			console.warn('Failed to load locale', code, e);
			return {};
		}
	}

	async function applyLocale(code) {
		i18n.current = code;
		const msgs = await loadLocale(code);
		document.querySelectorAll('[data-i18n]').forEach(el => {
			const key = el.dataset.i18n;
			if (!msgs || !msgs[key]) return;
			// If element contains form controls or inputs, replace only the leading text node
			if (el.querySelector && el.querySelector('input, textarea, select, .readonly-field')) {
				// find first text node child and replace its text
				for (let node of Array.from(el.childNodes)) {
					if (node.nodeType === Node.TEXT_NODE) {
						node.textContent = msgs[key];
						break;
					}
				}
			} else {
				el.textContent = msgs[key];
			}
		});

		// placeholders (data-i18n-placeholder)
		document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
			const key = el.dataset.i18nPlaceholder;
			if (msgs && msgs[key]) el.setAttribute('placeholder', msgs[key]);
		});

		// update dynamic labels: import button, add button, recent open buttons
		const importBtn = document.getElementById('importBtn');
		const addBtn = document.getElementById('addBtn');
		if (importBtn && msgs && msgs.import_pdfs) importBtn.textContent = msgs.import_pdfs;
		if (addBtn && msgs && msgs.add) addBtn.textContent = msgs.add;
		// recent list open buttons
		document.querySelectorAll('.recent-open-btn, .recent-open-btn.btn').forEach(b => {
			if (msgs && msgs.open_pdf) b.textContent = msgs.open_pdf;
		});

		// mark the active flag
		document.querySelectorAll('.lang-picker .flag').forEach(img => {
			if (img.dataset.locale === code) img.classList.add('active'); else img.classList.remove('active');
		});

		// expose synchronous helpers after loading messages
		window.getI18nMessage = (k) => {
			if (!k) return '';
			const m = i18n.messages[i18n.current] || (window._LOCALES && window._LOCALES[i18n.current]) || {};
			return m[k] || '';
		};
		window.getCurrentLocale = () => i18n.current;

		// notify managers to refresh dynamic texts if they expose a refresh method
		if (window.formatManager && typeof window.formatManager.refreshI18n === 'function') window.formatManager.refreshI18n();
		if (window.productManager && typeof window.productManager.refreshI18n === 'function') window.productManager.refreshI18n();
	}

	// wire topbar flag clicks
	const langPicker = document.getElementById('langPicker');
	if (langPicker) {
		langPicker.addEventListener('click', (ev) => {
			const tgt = ev.target.closest('.flag');
			if (!tgt) return;
			const code = tgt.dataset.locale || 'en';
			applyLocale(code);
		});
		// default to en
		applyLocale('en');
	}

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
			if (!paths || paths.length === 0) { showToast('No files selected.'); return; }
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
			// refresh recent/products and force a search refresh so new items appear in the list
			try {
				const doRefresh = () => {
					try {
						if (window.productManager && typeof window.productManager.renderRecent === 'function') {
							window.productManager.renderRecent();
						}
						const si = document.getElementById('searchInput');
						if (si) {
							si.value = '';
							si.dispatchEvent(new Event('input'));
						}
					} catch (e) { console.debug('refresh after import failed (inner)', e && e.message); }
				};
				// run an immediate refresh and a delayed one to handle timing differences in packaged apps
				doRefresh();
				setTimeout(doRefresh, 200);
			} catch (e) { console.debug('refresh after import failed', e && e.message); }

			// show a short toast with number of imported items (count successful results)
			try {
				let doneCount = 0;
				if (Array.isArray(res)) doneCount = res.reduce((acc, r) => acc + ((r && r.ok) ? 1 : 0), 0);
				else if (res && res.ok) doneCount = 1;
				showToast((window.getI18nMessage && window.getI18nMessage('import_done')) ? (window.getI18nMessage('import_done') + ` (${doneCount})`) : `Import complete (${doneCount})`);
			} catch(e) {}
		});
	}

	// keyboard shortcut toggle for devtools (Ctrl+Shift+I) and F12 fallback
	window.addEventListener('keydown', (ev) => {
		try {
			const isMac = navigator.platform.toUpperCase().includes('MAC');
			// Ctrl+Shift+I on Windows/Linux, Cmd+Opt+I on mac usually; support Ctrl+Shift+I and F12
			if ((ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'i') || ev.key === 'F12') {
				if (window.api && typeof window.api.toggleDevTools === 'function') {
					window.api.toggleDevTools();
					ev.preventDefault();
				}
			}
		} catch (e) { /* noop */ }
	});

	// auto-import feature removed; keep only manual import button above
});