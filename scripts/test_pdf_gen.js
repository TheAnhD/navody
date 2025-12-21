(async()=>{
  try{
    const db=require('../db');
    await db.init();
    const items = await db.searchProducts('');
    console.log('items', items.length);
    if (!items.length) { console.log('no products'); return; }
    const p = items[0];
    console.log('p.id', p.id, 'nameLen', (p.name||'').length, 'textLen', (p.text_body||'').length);
    const pdf = require('../pdf');
    const template = { pageSize: 'A4', labelWidthMm: 50, labelHeightMm: 20, cols: 3, rows: 8, marginMm: 5, fontSize: 10 };
    console.log('calling generate');
    const out = await pdf.generatePdfForProduct(p, template);
    console.log('out:', out);
  } catch (e) { console.error('ERR in test script', e); process.exit(1); }
})();
