const fs = require('fs');
const path = require('path');
const db = require('../db');

(async ()=>{
  const DB_FILE = path.join(__dirname, '..', 'data.sqlite');
  if (fs.existsSync(DB_FILE)) {
    const bak = path.join(__dirname, '..', `data.sqlite.bak.${Date.now()}`);
    fs.copyFileSync(DB_FILE, bak);
    console.log('Backed up DB to', bak);
  } else {
    console.log('No DB file found to back up.');
  }

  await db.init();
  try {
    // Delete all rows from products
    db.db.run('DELETE FROM products');
    // Vacuum / rebuild not necessary for sql.js but we save the DB
    db.save();
    console.log('Cleared products table and saved DB.');
  } catch (e) {
    console.error('Failed to clear DB:', e && e.message);
  }
})();
