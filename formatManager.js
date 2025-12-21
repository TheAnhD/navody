// FormatManager: handles storage and rendering of label formats
class FormatManager {
    constructor(options = {}) {
        this.listEl = document.getElementById(options.listId || 'formatsList');
        this.saveBtn = document.getElementById(options.saveBtnId || 'saveFormatBtn');
        this.formFields = {
            name: document.getElementById(options.nameId || 'formatName'),
            pageSize: document.getElementById(options.pageSizeId || 'fmt_pageSize'),
            labelW: document.getElementById(options.labelWId || 'fmt_labelW'),
            labelH: document.getElementById(options.labelHId || 'fmt_labelH'),
            cols: document.getElementById(options.colsId || 'fmt_cols'),
            rows: document.getElementById(options.rowsId || 'fmt_rows'),
                margin: document.getElementById(options.marginId || 'fmt_margin'),
                pageTopOffset: document.getElementById(options.pageTopOffsetId || 'fmt_pageTopOffset'),
                pageLeftOffset: document.getElementById(options.pageLeftOffsetId || 'fmt_pageLeftOffset'),
                hGap: document.getElementById(options.hGapId || 'fmt_hGap'),
                vGap: document.getElementById(options.vGapId || 'fmt_vGap'),
            fontSize: document.getElementById(options.fontSizeId || 'fmt_fontSize'),
        };
        this.defaultKey = 'navody_default_format_index';
        this.storageKey = 'navody_formats';
        this.editingIndex = null;
        this.editModalEl = document.getElementById(options.editModalId || 'formatEditModal');
        this.editFields = {
            name: document.getElementById('editFormatName'),
            pageSize: document.getElementById('edit_fmt_pageSize'),
            labelW: document.getElementById('edit_fmt_labelW'),
            labelH: document.getElementById('edit_fmt_labelH'),
            cols: document.getElementById('edit_fmt_cols'),
            rows: document.getElementById('edit_fmt_rows'),
            margin: document.getElementById('edit_fmt_margin'),
            fontSize: document.getElementById('edit_fmt_fontSize'),
        };
        this.bind();
    }

    bind() {
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => {
                const f = {
                    name: (this.formFields.name && this.formFields.name.value) || 'Untitled',
                    pageSize: this.formFields.pageSize && this.formFields.pageSize.value,
                    labelWidthMm: parseFloat(this.formFields.labelW && this.formFields.labelW.value) || 50,
                    labelHeightMm: parseFloat(this.formFields.labelH && this.formFields.labelH.value) || 20,
                    cols: parseInt(this.formFields.cols && this.formFields.cols.value, 10) || 3,
                    rows: parseInt(this.formFields.rows && this.formFields.rows.value, 10) || 8,
                        marginMm: parseFloat(this.formFields.margin && this.formFields.margin.value) || 5,
                        pageTopOffsetMm: parseFloat(this.formFields.pageTopOffset && this.formFields.pageTopOffset.value) || 0,
                        pageLeftOffsetMm: parseFloat(this.formFields.pageLeftOffset && this.formFields.pageLeftOffset.value) || 0,
                        hGapMm: parseFloat(this.formFields.hGap && this.formFields.hGap.value) || 0,
                        vGapMm: parseFloat(this.formFields.vGap && this.formFields.vGap.value) || 0,
                    fontSize: parseFloat(this.formFields.fontSize && this.formFields.fontSize.value) || 10,
                };
                const arr = this.getFormats();
                if (this.editingIndex !== null && Number.isInteger(this.editingIndex) && this.editingIndex >= 0 && this.editingIndex < arr.length) {
                    // update existing
                    arr[this.editingIndex] = f;
                    this.editingIndex = null;
                } else {
                    // new format -> add to front
                    arr.unshift(f);
                }
                this.saveFormats(arr);
                this.renderFormats();
                // clear form
                if (this.formFields.name) this.formFields.name.value = '';
            });
        }

        // Bind preview updates for create form
        this.previewEl = document.getElementById('formatPreview');
        const inputs = ['labelW','labelH','cols','rows','margin','pageTopOffset','pageLeftOffset','hGap','vGap','fontSize'];
        inputs.forEach(k => {
            const el = this.formFields[k];
            if (el) el.addEventListener('input', () => this.renderPreviewFromForm());
        });

    // Wire modal save/cancel
    const saveEditBtn = document.getElementById('saveFormatEditBtn');
    const cancelEditBtn = document.getElementById('cancelFormatEditBtn');
    const closeEditBtn = document.getElementById('closeFormatEditModal');
    if (saveEditBtn) saveEditBtn.addEventListener('click', () => this._saveEdit());
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => this._closeEditModal());
    if (closeEditBtn) closeEditBtn.addEventListener('click', () => this._closeEditModal());
    }

    // Render a small SVG preview into the preview element using current form values
    renderPreviewFromForm() {
        if (!this.previewEl) return;
        const fmt = {
            pageSize: this.formFields.pageSize && this.formFields.pageSize.value,
            labelWidthMm: Number(this.formFields.labelW && this.formFields.labelW.value) || 50,
            labelHeightMm: Number(this.formFields.labelH && this.formFields.labelH.value) || 20,
            cols: parseInt(this.formFields.cols && this.formFields.cols.value,10) || 3,
            rows: parseInt(this.formFields.rows && this.formFields.rows.value,10) || 8,
            marginMm: Number(this.formFields.margin && this.formFields.margin.value) || 5,
            pageTopOffsetMm: Number(this.formFields.pageTopOffset && this.formFields.pageTopOffset.value) || 0,
            pageLeftOffsetMm: Number(this.formFields.pageLeftOffset && this.formFields.pageLeftOffset.value) || 0,
            hGapMm: Number(this.formFields.hGap && this.formFields.hGap.value) || 0,
            vGapMm: Number(this.formFields.vGap && this.formFields.vGap.value) || 0,
        };
        this._renderSvgPreview(this.previewEl, fmt);
    }

    // Render preview for edit modal
    renderEditPreview() {
        const el = document.getElementById('editFormatPreview');
        if (!el) return;
        const fmt = {
            pageSize: this.editFields.pageSize && this.editFields.pageSize.value,
            labelWidthMm: Number(this.editFields.labelW && this.editFields.labelW.value) || 50,
            labelHeightMm: Number(this.editFields.labelH && this.editFields.labelH.value) || 20,
            cols: parseInt(this.editFields.cols && this.editFields.cols.value,10) || 3,
            rows: parseInt(this.editFields.rows && this.editFields.rows.value,10) || 8,
            marginMm: Number(this.editFields.margin && this.editFields.margin.value) || 5,
            pageTopOffsetMm: Number(this.editFields.pageTopOffset && this.editFields.pageTopOffset.value) || 0,
            pageLeftOffsetMm: Number(this.editFields.pageLeftOffset && this.editFields.pageLeftOffset.value) || 0,
            hGapMm: Number(this.editFields.hGap && this.editFields.hGap.value) || 0,
            vGapMm: Number(this.editFields.vGap && this.editFields.vGap.value) || 0,
        };
        this._renderSvgPreview(el, fmt);
    }

    _renderSvgPreview(container, fmt) {
        // map A4 (210x297 mm) into container size, keep margin
        const w = container.clientWidth || 320;
        const h = container.clientHeight || 240;
        const pageWmm = 210; const pageHmm = 297;
        const scale = Math.min((w-20)/pageWmm, (h-20)/pageHmm);
        const pxW = pageWmm * scale; const pxH = pageHmm * scale;
        const offsetX = (w - pxW)/2; const offsetY = (h - pxH)/2;
        const labelWpx = fmt.labelWidthMm * scale;
        const labelHpx = fmt.labelHeightMm * scale;
        const marginPx = (fmt.marginMm || 0) * scale;
        const topOffsetPx = (fmt.pageTopOffsetMm || 0) * scale;
        const leftOffsetPx = (fmt.pageLeftOffsetMm || 0) * scale;
        const hGapPx = (fmt.hGapMm || 0) * scale;
        const vGapPx = (fmt.vGapMm || 0) * scale;

        let svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
        // page rect
        svg += `<rect x="${offsetX}" y="${offsetY}" width="${pxW}" height="${pxH}" fill="#fff" stroke="#666" stroke-width="1"/>`;
        // unusable margins around page (visual)
        svg += `<rect x="${offsetX}" y="${offsetY}" width="${pxW}" height="${topOffsetPx}" fill="rgba(255,0,0,0.06)"/>`;
        svg += `<rect x="${offsetX}" y="${offsetY}" width="${leftOffsetPx}" height="${pxH}" fill="rgba(255,0,0,0.04)"/>`;

        // labels
        for (let r=0;r<fmt.rows;r++){
            for (let c=0;c<fmt.cols;c++){
                const lx = offsetX + leftOffsetPx + marginPx + c * (labelWpx + hGapPx);
                const ly = offsetY + topOffsetPx + marginPx + r * (labelHpx + vGapPx);
                svg += `<rect x="${lx}" y="${ly}" width="${labelWpx}" height="${labelHpx}" fill="rgba(0,128,0,0.03)" stroke="#0a0" stroke-width="0.5"/>`;
            }
        }

        svg += `</svg>`;
        container.innerHTML = svg;
    }

    getFormats() {
        try { return JSON.parse(localStorage.getItem(this.storageKey) || '[]'); }
        catch (e) { return []; }
    }

    saveFormats(arr) { localStorage.setItem(this.storageKey, JSON.stringify(arr)); }

    getDefaultFormatIndex() { return parseInt(localStorage.getItem(this.defaultKey) || '0', 10); }
    setDefaultFormatIndex(i) { localStorage.setItem(this.defaultKey, String(i)); }

    renderFormats() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        const arr = this.getFormats();
        const def = this.getDefaultFormatIndex();
        arr.forEach((f, idx) => {
            const li = document.createElement('li');
            li.className = 'format-item';
            li.innerHTML = `<div><strong>${f.name}</strong><div class="fmt-meta">${f.labelWidthMm}x${f.labelHeightMm} mm • ${f.cols}x${f.rows}</div></div>`;
            const btns = document.createElement('div');
            btns.className = 'btns';
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => {
                // open modal and populate editFields
                if (this.editFields.name) this.editFields.name.value = f.name || '';
                if (this.editFields.pageSize) this.editFields.pageSize.value = f.pageSize || 'A4';
                if (this.editFields.labelW) this.editFields.labelW.value = f.labelWidthMm || '';
                if (this.editFields.labelH) this.editFields.labelH.value = f.labelHeightMm || '';
                if (this.editFields.cols) this.editFields.cols.value = f.cols || '';
                if (this.editFields.rows) this.editFields.rows.value = f.rows || '';
                if (this.editFields.margin) this.editFields.margin.value = f.marginMm || '';
                if (this.editFields.pageTopOffset) this.editFields.pageTopOffset.value = f.pageTopOffsetMm || 0;
                if (this.editFields.pageLeftOffset) this.editFields.pageLeftOffset.value = f.pageLeftOffsetMm || 0;
                if (this.editFields.hGap) this.editFields.hGap.value = f.hGapMm || 0;
                if (this.editFields.vGap) this.editFields.vGap.value = f.vGapMm || 0;
                if (this.editFields.fontSize) this.editFields.fontSize.value = f.fontSize || '';
                this.editingIndex = idx;
                if (this.editModalEl) this.editModalEl.classList.remove('hidden');
                // attach live preview bindings for edit modal inputs
                const editInputs = ['labelW','labelH','cols','rows','margin','pageTopOffset','pageLeftOffset','hGap','vGap','fontSize'];
                editInputs.forEach(k=>{
                    const el = this.editFields[k];
                    if (el) el.addEventListener('input', ()=> this.renderEditPreview());
                });
                // render preview initially
                this.renderEditPreview();
            });
            const delBtn = document.createElement('button');
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', () => { const a = this.getFormats(); a.splice(idx,1); this.saveFormats(a); this.renderFormats(); });
            btns.appendChild(editBtn);
            btns.appendChild(delBtn);
            li.appendChild(btns);
            this.listEl.appendChild(li);
        });
    }

    _closeEditModal() {
        if (this.editModalEl) this.editModalEl.classList.add('hidden');
        this.editingIndex = null;
    }

    async _saveEdit() {
        if (this.editingIndex === null) return this._closeEditModal();
        const arr = this.getFormats();
        if (!arr || !arr[this.editingIndex]) return this._closeEditModal();
        const f = {
            name: (this.editFields.name && this.editFields.name.value) || 'Untitled',
            pageSize: this.editFields.pageSize && this.editFields.pageSize.value,
            labelWidthMm: parseFloat(this.editFields.labelW && this.editFields.labelW.value) || 50,
            labelHeightMm: parseFloat(this.editFields.labelH && this.editFields.labelH.value) || 20,
            cols: parseInt(this.editFields.cols && this.editFields.cols.value, 10) || 3,
            rows: parseInt(this.editFields.rows && this.editFields.rows.value, 10) || 8,
            marginMm: parseFloat(this.editFields.margin && this.editFields.margin.value) || 5,
            pageTopOffsetMm: parseFloat(this.editFields.pageTopOffset && this.editFields.pageTopOffset.value) || 0,
            pageLeftOffsetMm: parseFloat(this.editFields.pageLeftOffset && this.editFields.pageLeftOffset.value) || 0,
            hGapMm: parseFloat(this.editFields.hGap && this.editFields.hGap.value) || 0,
            vGapMm: parseFloat(this.editFields.vGap && this.editFields.vGap.value) || 0,
            fontSize: parseFloat(this.editFields.fontSize && this.editFields.fontSize.value) || 10,
        };
        arr[this.editingIndex] = f;
        this.saveFormats(arr);
        this.renderFormats();
        this._closeEditModal();
    }

    getTemplateFromFormat(format) {
    return format || this.getFormats()[this.getDefaultFormatIndex()] || { pageSize: 'A4', labelWidthMm: 50, labelHeightMm: 20, cols: 3, rows: 8, marginMm: 5, pageTopOffsetMm:0, pageLeftOffsetMm:0, hGapMm:0, vGapMm:0, fontSize: 10 };
    }

    // Populate format selection UI (used by modal). onUse(format) will be called when user picks a format.
    populateOptions(containerEl, onUse) {
        if (!containerEl) return;
        containerEl.innerHTML = '';
        const arr = this.getFormats();
        arr.forEach((f) => {
            const div = document.createElement('div');
            div.className = 'format-option';
            const title = document.createElement('div');
            title.innerHTML = `<strong>${f.name}</strong><div style="font-size:12px;color:#666">${f.labelWidthMm}x${f.labelHeightMm} mm • ${f.cols}x${f.rows}</div>`;
            const actions = document.createElement('div');
            const useBtn = document.createElement('button');
            useBtn.textContent = 'Use';
            useBtn.className = 'use-btn';
            useBtn.addEventListener('click', () => { if (onUse) onUse(f); });
            actions.appendChild(useBtn);
            div.appendChild(title);
            div.appendChild(actions);
            containerEl.appendChild(div);
        });
    }
}

// expose globally for renderer to use
// Export for CommonJS and attach to window when available (renderer)
if (typeof window !== 'undefined') {
    window.FormatManager = FormatManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormatManager;
}
