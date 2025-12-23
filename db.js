const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// Determine a writable location for the DB. Prefer explicit env override, then Electron's userData
// (for packaged apps on Windows/macOS). Fall back to project dir for scripts/dev mode.
let baseDir = __dirname;
if (process.env.NAVODY_DATA_DIR) {
	baseDir = process.env.NAVODY_DATA_DIR;
} else {
	try {
		// If running inside Electron main process, prefer app.getPath('userData')
		const electron = require('electron');
		if (electron && electron.app && typeof electron.app.getPath === 'function') {
			baseDir = electron.app.getPath('userData');
		}
	} catch (e) {
		// not running in Electron or require failed, keep __dirname
	}
}

// Ensure base directory exists and is writable
try { fs.mkdirSync(baseDir, { recursive: true }); } catch (e) { /* ignore mkdir errors */ }

const DB_FILE = path.join(baseDir, 'data.sqlite');
console.log('Navody DB_FILE resolved to', DB_FILE);

// If we picked a different baseDir than the repo root and there's an existing DB next to the repo,
// copy it to the new location so packaged apps keep development data when possible.
const devDbFile = path.join(__dirname, 'data.sqlite');
if (DB_FILE !== devDbFile && fs.existsSync(devDbFile) && !fs.existsSync(DB_FILE)) {
	try {
		fs.copyFileSync(devDbFile, DB_FILE);
		console.log('Navody: copied existing data.sqlite from project root to', DB_FILE);
	} catch (e) {
		console.warn('Navody: failed to copy project data.sqlite to userData:', e && e.message);
	}
}

class Database {
	constructor() {
		this.SQL = null;
		this.db = null;
	}

	async init() {
		if (!this.SQL) {
			// Provide locateFile that works both in development (node_modules path) and when app is packaged.
			const locateFile = (file) => {
				try {
					const electron = require('electron');
					if (electron && electron.app && electron.app.isPackaged) {
						const p = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file);
						console.log('sql.js locateFile ->', p);
						return p;
					}
				} catch (e) {
					// ignore and fallback
				}
				// development or fallback
				const devp = path.join(__dirname, 'node_modules', 'sql.js', 'dist', file);
				console.log('sql.js locateFile fallback ->', devp);
				return devp;
			};

			this.SQL = await initSqlJs({ locateFile });
		}

		if (fs.existsSync(DB_FILE)) {
			const data = fs.readFileSync(DB_FILE);
			this.db = new this.SQL.Database(new Uint8Array(data));
		} else {
			this.db = new this.SQL.Database();
			this.db.run(`CREATE TABLE IF NOT EXISTS products (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				ean TEXT,
				text_body TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)`);
			this.save();
		}
	}

	save() {
		const data = this.db.export();
		const buffer = Buffer.from(data);
		fs.writeFileSync(DB_FILE, buffer);
	}

	async ensure() { if (!this.db) await this.init(); }

	async insertProduct({ name, ean, text_body }) {
		await this.ensure();
		const stmt = this.db.prepare(`INSERT INTO products (name, ean, text_body, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
		stmt.run([name, ean || null, text_body || null]);
		const res = this.db.exec('SELECT last_insert_rowid() as id');
		let id = null;
		if (res && res[0] && res[0].values && res[0].values[0]) id = res[0].values[0][0];
		this.save();
		return { id, name, ean, text_body };
	}

	async searchProducts(query, limit = 1000, offset = 0) {
		await this.ensure();
		const q = `%${query}%`;
		const lim = Number(limit) || 1000;
		const off = Number(offset) || 0;
		const stmt = this.db.prepare(`SELECT id, name, ean, text_body FROM products WHERE name LIKE ? OR ean LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?`);
		stmt.bind([q, q, lim, off]);
		const results = [];
		while (stmt.step()) {
			const row = stmt.getAsObject();
			results.push(row);
		}
		stmt.free();
		return results;
	}

	async getProductById(id) {
		await this.ensure();
		const stmt = this.db.prepare(`SELECT id, name, ean, text_body FROM products WHERE id = ?`);
		stmt.bind([id]);
		if (stmt.step()) {
			const row = stmt.getAsObject();
			stmt.free();
			return row;
		}
		stmt.free();
		return null;
	}

	async updateProduct({ id, name, text_body }) {
		await this.ensure();
		const stmt = this.db.prepare(`UPDATE products SET name = ?, text_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
		stmt.run([name, text_body, id]);
		this.save();
		return this.getProductById(id);
	}

	async updateProductEan({ id, ean }) {
		await this.ensure();
		const stmt = this.db.prepare(`UPDATE products SET ean = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
		stmt.run([ean || null, id]);
		this.save();
		return this.getProductById(id);
	}

	async deleteProduct(id) {
		await this.ensure();
		const stmt = this.db.prepare(`DELETE FROM products WHERE id = ?`);
		stmt.run([id]);
		this.save();
		return true;
	}
}

const database = new Database();
module.exports = database;