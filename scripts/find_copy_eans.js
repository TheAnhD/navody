(async ()=>{
  const db = require('../db');
  await db.init();
  const res = db.db.exec('SELECT id, ean, name FROM products');
  if (!res || res.length === 0) return console.log('no rows');
  const cols = res[0].columns;
  const rows = res[0].values.map(v => {
    const o = {};
    cols.forEach((c, i) => o[c] = v[i]);
    return o;
  });
  const bad = rows.filter(r => {
    const e = (r.ean || '').toString();
    return /copy/i.test(e) || !/^\d+$/.test(e);
  });
  console.log('total rows:', rows.length);
  console.log('products with non-digit or containing "copy":', bad.length);
  console.log(bad.slice(0, 50));
})();
