const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_FILE = path.join(__dirname, 'data.sqlite');

class Database {
	constructor() {
		this.SQL = null;
		this.db = null;
	}

	async init() {
		if (!this.SQL) this.SQL = await initSqlJs({ locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file) });

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