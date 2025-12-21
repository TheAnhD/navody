const database = require('../db');

async function run() {
  await database.init();
  const res = database.db.exec('SELECT id, ean FROM products');
  if (!res || !res[0] || !res[0].values) {
    console.log('No products found');
    return;
  }
  const rows = res[0].values.map(v => ({ id: v[0], ean: v[1] }));
  const groups = {};
  for (const r of rows) {
    const key = (r.ean || '').toString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(r.id);
  }
  let removed = 0;
  for (const [ean, ids] of Object.entries(groups)) {
    if (!ean) continue; // skip empty ean
    if (ids.length <= 1) continue;
    ids.sort((a,b)=>a-b); // keep smallest id
    const keep = ids[0];
    const toDelete = ids.slice(1);
    for (const id of toDelete) {
      try {
        await database.deleteProduct(id);
        console.log('Deleted duplicate id', id, 'for ean', ean);
        removed++;
      } catch (e) {
        console.error('Failed to delete', id, e && e.message);
      }
    }
  }
  console.log('Dedupe complete. Removed', removed, 'duplicates');
}

run().catch(err=>{ console.error('Error running dedupe', err); process.exit(1); });
