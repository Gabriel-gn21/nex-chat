/**
 * stock.mjs - Controle de estoque com SQLite (node:sqlite nativo)
 */
import { DatabaseSync } from 'node:sqlite';
import { Router }       from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, 'stock.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS products (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT '',
    unit       TEXT NOT NULL DEFAULT 'un',
    quantity   REAL NOT NULL DEFAULT 0,
    min_alert  REAL NOT NULL DEFAULT 0,
    price      REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS movements (
    id           TEXT PRIMARY KEY,
    product_id   TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type         TEXT NOT NULL,
    quantity     REAL NOT NULL,
    balance      REAL NOT NULL,
    reason       TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL
  );
`);

// ─── helpers ─────────────────────────────────────────────────────────────────
const uid  = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const now  = () => new Date().toISOString();

function logMovement(productId, productName, type, qty, balance, reason) {
  db.prepare(`
    INSERT INTO movements (id,product_id,product_name,type,quantity,balance,reason,created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(`mov_${uid()}`, productId, productName, type, qty, balance, reason, now());
}

// ─── router ──────────────────────────────────────────────────────────────────
export const stockRouter = Router();

// GET /api/stock/products
stockRouter.get('/products', (_req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all());
});

// POST /api/stock/products
stockRouter.post('/products', (req, res) => {
  const { name, category = '', unit = 'un', quantity = 0, min_alert = 0, price = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });

  const id = `prod_${uid()}`;
  const ts = now();
  db.prepare(`
    INSERT INTO products (id,name,category,unit,quantity,min_alert,price,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, name.trim(), category, unit, Number(quantity), Number(min_alert), Number(price), ts, ts);

  if (Number(quantity) > 0) {
    logMovement(id, name.trim(), 'in', Number(quantity), Number(quantity), 'Estoque inicial');
  }

  res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(id));
});

// PUT /api/stock/products/:id
stockRouter.put('/products/:id', (req, res) => {
  const { name, category = '', unit = 'un', min_alert = 0, price = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });

  db.prepare(`
    UPDATE products SET name=?,category=?,unit=?,min_alert=?,price=?,updated_at=? WHERE id=?
  `).run(name.trim(), category, unit, Number(min_alert), Number(price), now(), req.params.id);

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
});

// DELETE /api/stock/products/:id
stockRouter.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM movements WHERE product_id=?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/stock/products/:id/adjust - { delta: number, reason: string }
stockRouter.post('/products/:id/adjust', (req, res) => {
  const { delta, reason = '' } = req.body;
  if (typeof delta !== 'number' || isNaN(delta)) {
    return res.status(400).json({ error: 'delta (number) é obrigatório' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'produto não encontrado' });

  const newQty = Math.max(0, product.quantity + delta);
  db.prepare('UPDATE products SET quantity=?,updated_at=? WHERE id=?').run(newQty, now(), product.id);
  logMovement(product.id, product.name, delta >= 0 ? 'in' : 'out', Math.abs(delta), newQty, reason);

  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(product.id));
});

// POST /api/stock/sell - { productName: string, quantity: number, reason?: string }
// Endpoint para integração com o chatbot via nó integration_api
stockRouter.post('/sell', (req, res) => {
  const { productName, quantity = 1, reason = 'Venda via chatbot' } = req.body;
  if (!productName) return res.status(400).json({ error: 'productName é obrigatório' });

  const product = db.prepare(`SELECT * FROM products WHERE name LIKE ?`).get(`%${productName}%`);
  if (!product) return res.status(404).json({ error: `Produto não encontrado: ${productName}` });

  const newQty = Math.max(0, product.quantity - Number(quantity));
  db.prepare('UPDATE products SET quantity=?,updated_at=? WHERE id=?').run(newQty, now(), product.id);
  logMovement(product.id, product.name, 'out', Number(quantity), newQty, reason);

  res.json({
    ok: true,
    product: db.prepare('SELECT * FROM products WHERE id=?').get(product.id),
    low_stock: newQty <= product.min_alert,
  });
});

// GET /api/stock/movements?product_id=&limit=
stockRouter.get('/movements', (req, res) => {
  const { product_id, limit = 200 } = req.query;
  if (product_id) {
    res.json(db.prepare(
      'SELECT * FROM movements WHERE product_id=? ORDER BY created_at DESC LIMIT ?'
    ).all(product_id, Number(limit)));
  } else {
    res.json(db.prepare(
      'SELECT * FROM movements ORDER BY created_at DESC LIMIT ?'
    ).all(Number(limit)));
  }
});

// GET /api/stock/export?format=csv|txt
stockRouter.get('/export', (req, res) => {
  const format   = req.query.format === 'txt' ? 'txt' : 'csv';
  const products = db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all();
  const dateStr  = new Date().toLocaleString('pt-BR');

  if (format === 'csv') {
    const header = 'Nome,Categoria,Unidade,Quantidade,Alerta Mínimo,Preço (R$),Última atualização';
    const rows   = products.map(p =>
      [`"${p.name}"`, `"${p.category}"`, p.unit, p.quantity, p.min_alert,
       p.price.toFixed(2), p.updated_at].join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
    res.send('﻿' + [header, ...rows].join('\r\n'));
  } else {
    const w  = [40, 12, 6, 10, 12, 14];
    const hr = '─'.repeat(w.reduce((a, b) => a + b + 3, 0));
    const row = (...cols) => cols.map((c, i) => String(c).padEnd(w[i])).join(' │ ');
    const lines = [
      `ESTOQUE - Exportado em ${dateStr}`,
      hr,
      row('Nome', 'Categoria', 'Un.', 'Qtd.', 'Alerta', 'Preço (R$)'),
      hr,
      ...products.map(p =>
        row(p.name, p.category || ' - ', p.unit, p.quantity, p.min_alert, p.price.toFixed(2))
      ),
      hr,
      `Total de produtos: ${products.length}`,
      `Valor total (qtd × preço): R$ ${products.reduce((s, p) => s + p.quantity * p.price, 0).toFixed(2)}`,
    ];
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.txt"');
    res.send(lines.join('\n'));
  }
});
