// ProductManager: handles product list UI, recent items, add/edit/delete operations
class ProductManager {
    constructor(options = {}) {
        this.searchInput = document.getElementById(options.searchInputId || 'searchInput');
        this.resultsEl = document.getElementById(options.resultsId || 'results');
        this.addBtn = document.getElementById(options.addBtnId || 'addBtn');
        this.nameEl = document.getElementById(options.nameId || 'name');
        this.eanEl = document.getElementById(options.eanId || 'ean');
        this.textEl = document.getElementById(options.textId || 'text_body');
        this.recentListEl = document.getElementById(options.recentListId || 'recentList');
        this.formatModalEl = document.getElementById(options.formatModalId || 'formatModal');
        this.formatSelectList = document.getElementById(options.formatSelectListId || 'formatSelectList');
        this.generateStatusEl = document.getElementById(options.statusId || 'status');

        this.editModal = document.getElementById(options.editModalId || 'editModal');
        this.editEan = document.getElementById(options.editEanId || 'editEan');
        this.editName = document.getElementById(options.editNameId || 'editName');
        this.editText = document.getElementById(options.editTextId || 'editText');
        this.saveEditBtn = document.getElementById(options.saveEditBtnId || 'saveEditBtn');

        this._editingProductId = null;
        this._formatModalBtn = null;
        this.recentKey = 'navody_recent';

        this.bind();
    }

    bind() {
        if (this.searchInput && this.resultsEl) {
            // implement basic paging to avoid rendering too many DOM nodes at once
            this._pageSize = 40;
            this._page = 0;
            this._lastQuery = '';
            this._hasMore = false;
            this.searchInput.addEventListener('input', async (e) => {
                const q = e.target.value.trim();
                this._lastQuery = q;
                this._page = 0;
                const offset = 0;
                const items = await window.api.searchProducts(q, this._pageSize, offset);
                this._hasMore = (items.length === this._pageSize);
                this.renderResults(items, true);
            });

            // create/load more control
            this.loadMoreBtn = document.createElement('button');
            this.loadMoreBtn.textContent = 'Load more';
            this.loadMoreBtn.className = 'btn';
            this.loadMoreBtn.style.display = 'none';
            this.loadMoreBtn.addEventListener('click', async () => {
                this._page += 1;
                const offset = this._page * this._pageSize;
                const items = await window.api.searchProducts(this._lastQuery, this._pageSize, offset);
                this._hasMore = (items.length === this._pageSize);
                this.renderResults(items, false);
            });
            // append the button under results container
            if (this.resultsEl && this.resultsEl.parentNode) this.resultsEl.parentNode.appendChild(this.loadMoreBtn);
        }

        if (this.addBtn) {
            this.addBtn.addEventListener('click', async () => {
                const product = { name: this.nameEl?.value?.trim(), ean: this.eanEl?.value?.trim(), text_body: this.textEl?.value };
                if (!product.name) return alert('Name required');
                if (!product.text_body || String(product.text_body).trim().length === 0) return alert('Text body is required');
                const created = await window.api.insertProduct(product);
                this.pushRecent({ id: created.id, name: created.name, ean: created.ean });
                if (this.nameEl) this.nameEl.value = '';
                if (this.eanEl) this.eanEl.value = '';
                if (this.textEl) this.textEl.value = '';
                if (this.generateStatusEl) this.generateStatusEl.textContent = 'Product added';
                if (this.searchInput) this.searchInput.dispatchEvent(new Event('input'));
            });
        }

        if (this.saveEditBtn) {
            this.saveEditBtn.addEventListener('click', async () => {
                if (!this._editingProductId) return;
                const updated = { id: this._editingProductId, name: this.editName.value.trim(), text_body: this.editText.value };
                try {
                    await window.api.updateProduct(updated);
                    this.editModal.classList.add('hidden');
                    if (this.searchInput) this.searchInput.dispatchEvent(new Event('input'));
                    const rec = this.getRecent();
                    for (let i=0;i<rec.length;i++){
                        if (String(rec[i].id)===String(this._editingProductId)){
                            rec[i].name = updated.name;
                            break;
                        }
                    }
                    this.saveRecent(rec);
                    this.renderRecent();
                } catch (err) { alert('Error updating product: ' + err.message); }
            });
        }
    }

    renderResults(items, replace = true) {
        if (replace) this.resultsEl.innerHTML = '';
        items.forEach(it => {
            const li = document.createElement('li');
            li.className = 'product-card';
            li.dataset.id = it.id;

            const title = document.createElement('div');
            title.className = 'product-label';
            title.textContent = it.name;
            li.appendChild(title);

            const ean = document.createElement('div');
            ean.className = 'product-ean';
            ean.textContent = it.ean || '';
            // If EAN is very long, reduce its font-size so it doesn't overflow the card
            if (ean.textContent && ean.textContent.length > 20) {
                // apply a smaller font dynamically; choose between 16px down to 12px
                const len = ean.textContent.length;
                // map length to size: 21-30 -> 16px, 31-50 -> 14px, >50 -> 12px
                let fs = 16;
                if (len > 30 && len <= 50) fs = 14;
                if (len > 50) fs = 12;
                ean.style.fontSize = fs + 'px';
                ean.style.opacity = '0.85';
            }
            li.appendChild(ean);

            const actions = document.createElement('div');
            actions.className = 'product-actions';

            const clipBtn = document.createElement('button');
            clipBtn.className = 'icon-btn icon-clipboard';
            clipBtn.title = 'Generate PDF';
        clipBtn.innerHTML = `
            <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="2" width="6" height="4" rx="1" stroke-linejoin="round"/><rect x="3" y="6" width="18" height="16" rx="2" stroke-linejoin="round"/></svg>`;
            clipBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this._formatModalBtn = clipBtn;
                this.openFormatModal(it.id, clipBtn);
            });
            actions.appendChild(clipBtn);

            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn icon-edit';
            editBtn.title = 'Edit';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.openEditModal(it); });
            actions.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn icon-delete';
            delBtn.title = 'Delete';
        delBtn.innerHTML = `
            <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11v6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            delBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (!confirm('Delete this product? This action cannot be undone.')) return;
                try {
                    await window.api.deleteProduct(it.id);
                    const rec = this.getRecent().filter(r => String(r.id) !== String(it.id));
                    this.saveRecent(rec);
                    this.renderRecent();
                    if (this.searchInput) this.searchInput.dispatchEvent(new Event('input'));
                } catch (err) { alert('Error deleting product: ' + err.message); }
            });
            actions.appendChild(delBtn);

            li.appendChild(actions);
            this.resultsEl.appendChild(li);
        });
        // show or hide load more
        if (this.loadMoreBtn) {
            this.loadMoreBtn.style.display = (this._hasMore ? 'inline-block' : 'none');
        }
    }

    // Recent helpers
    getRecent() { try { return JSON.parse(localStorage.getItem(this.recentKey)||'[]'); } catch(e){return [];} }
    saveRecent(arr){ localStorage.setItem(this.recentKey, JSON.stringify(arr)); }
    pushRecent(item){ const arr = this.getRecent(); arr.unshift(item); while(arr.length>5) arr.pop(); this.saveRecent(arr); this.renderRecent(); }

    renderRecent(){ if(!this.recentListEl) return; this.recentListEl.innerHTML=''; this.getRecent().forEach(it=>{ const li=document.createElement('li'); li.className = 'recent-item';
        const left = document.createElement('div'); left.className = 'recent-left';
        const nameEl = document.createElement('div'); nameEl.className = 'recent-name'; nameEl.textContent = it.name || '';
        const eanEl = document.createElement('div'); eanEl.className = 'recent-ean'; eanEl.textContent = it.ean ? it.ean : '';
        left.appendChild(nameEl); left.appendChild(eanEl);
        li.appendChild(left);
        const openBtn = document.createElement('button'); openBtn.className = 'recent-open-btn'; openBtn.textContent = 'Open PDF'; openBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); this._formatModalBtn = openBtn; this.openFormatModal(it.id, openBtn); });
        li.appendChild(openBtn);
        this.recentListEl.appendChild(li);
    }); }

    openFormatModal(productId, btn) {
        if (this.formatSelectList) {
            // populate using global FormatManager if present
            if (window.formatManager) {
                window.formatManager.populateOptions(this.formatSelectList, (f) => {
                    this.formatModalEl.classList.add('hidden');
                    this.generatePdfForProductId(productId, btn, f);
                });
            }
        }
        if (this.formatModalEl) {
            // add modifier class to inner modal box for wider modern layout
            const box = this.formatModalEl.querySelector('.modal-box');
            if (box) box.classList.add('format-modal');
            this.formatModalEl.classList.remove('hidden');
        }
    }

    async generatePdfForProductId(id, btn, format) {
        try {
            if (btn) btn.disabled = true;
            if (this.generateStatusEl) this.generateStatusEl.textContent = 'Generating PDF...';
            let fmt = format || (window.formatManager && window.formatManager.getTemplateFromFormat()) || { pageSize: 'A4', labelWidthMm: 50, labelHeightMm: 20, cols: 3, rows: 8, marginMm: 5, fontSize: 10 };
            // Defensive validation: compute whether the template will overflow the page
            const pageWidthMm = fmt.pageSize === 'A4' ? 210 : 210;
            const pageHeightMm = fmt.pageSize === 'A4' ? 297 : 297;
            const cols = parseInt(fmt.cols, 10) || 1;
            const rows = parseInt(fmt.rows, 10) || 1;
            const marginMm = (fmt.marginMm !== undefined) ? Number(fmt.marginMm) : 5;
            const pageLeftOffsetMm = Number(fmt.pageLeftOffsetMm || 0);
            const pageTopOffsetMm = Number(fmt.pageTopOffsetMm || 0);
            const hGapMm = Number(fmt.hGapMm || 0);
            const vGapMm = Number(fmt.vGapMm || 0);
            const orig = Object.assign({}, fmt);

            // Total required width = leftOffset + 2*margin + cols*labelW + (cols-1)*hGap
            const totalLabelsWidth = pageLeftOffsetMm + (marginMm * 2) + (Number(fmt.labelWidthMm) || 0) * cols + Math.max(0, cols - 1) * hGapMm;
            // Total required height = topOffset + 2*margin + rows*labelH + (rows-1)*vGap
            const totalLabelsHeight = pageTopOffsetMm + (marginMm * 2) + (Number(fmt.labelHeightMm) || 0) * rows + Math.max(0, rows - 1) * vGapMm;

            if (totalLabelsWidth > pageWidthMm || totalLabelsHeight > pageHeightMm) {
                // Show a confirmation to the user asking to auto-fit the format to page
                const msgParts = [];
                if (totalLabelsWidth > pageWidthMm) msgParts.push(`width (${totalLabelsWidth.toFixed(1)}mm > ${pageWidthMm}mm)`);
                if (totalLabelsHeight > pageHeightMm) msgParts.push(`height (${totalLabelsHeight.toFixed(1)}mm > ${pageHeightMm}mm)`);
                const proceed = confirm(`The chosen format will overflow the page (${msgParts.join(', ')}).\nClick OK to automatically adjust label size to fit the page, or Cancel to keep values as-is.`);
                if (proceed) {
                    // compute max label width/height that fits when considering offsets and gaps
                    const availableWidthForLabels = pageWidthMm - pageLeftOffsetMm - (marginMm * 2) - Math.max(0, cols - 1) * hGapMm;
                    const maxLabelW = Math.floor(Math.max(1, availableWidthForLabels / cols));
                    const availableHeightForLabels = pageHeightMm - pageTopOffsetMm - (marginMm * 2) - Math.max(0, rows - 1) * vGapMm;
                    const maxLabelH = Math.floor(Math.max(1, availableHeightForLabels / rows));
                    fmt = Object.assign({}, fmt, { labelWidthMm: maxLabelW, labelHeightMm: maxLabelH });
                    console.log('Auto-fit applied. new template:', fmt, 'original:', orig);
                } else {
                    console.log('User chose to keep overflowing template as-is:', orig);
                }
            }
            console.log('generatePdf: originalTemplate=', orig, 'usedTemplate=', fmt);
            const p = await window.api.generatePdf({ productId: id, template: fmt });
            if (this.generateStatusEl) this.generateStatusEl.textContent = `PDF generated: ${p}`;
            window.api.openPath(p);
        } catch (err) {
            console.error(err);
            if (this.generateStatusEl) this.generateStatusEl.textContent = 'Error: ' + err.message;
            alert('Error generating PDF: ' + err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    openEditModal(product) {
        this._editingProductId = product.id;
        if (this.editEan) this.editEan.textContent = product.ean || '';
        if (this.editName) this.editName.value = product.name || '';
        if (this.editText) this.editText.value = product.text_body || '';
        if (this.editModal) this.editModal.classList.remove('hidden');
    }
}

// Export for CommonJS and attach to window when available (renderer)
if (typeof window !== 'undefined') {
    window.ProductManager = ProductManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductManager;
}
