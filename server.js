import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export function createApp(dbPath = resolve(root, 'data/shop.sqlite')) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0), description TEXT NOT NULL, image TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS items (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0), price INTEGER NOT NULL, PRIMARY KEY(order_id,product_id));`);
  const seed = db.prepare('INSERT OR IGNORE INTO products VALUES (?,?,?,?,?,?)');
  [
    [1, 'Pay de queso', 150, 30, 'Cremoso por dentro, doradito por fuera. Un clásico que abraza.', 'queso'],
    [2, 'Queso napolitano', 200, 30, 'Suave, delicado y bañado en nuestro caramelo de la casa.', 'napolitano'],
    [3, 'Pay de vainilla', 120, 30, 'Una base crujiente con el dulce aroma de la vainilla.', 'vainilla'],
    [4, 'Budín', 160, 30, 'La receta de siempre, con un toque de canela y mucho cariño.', 'budin'],
    [5, 'Pastel', 220, 30, 'Capas de chocolate para celebrar los pequeños grandes momentos.', 'pastel'],
  ].forEach(p => seed.run(...p));

  function customer(req) {
    const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.slice(8);
    if (!token) return null;
    return db.prepare('SELECT c.id,c.name,c.email,c.phone FROM customers c JOIN sessions s ON c.id=s.customer_id WHERE s.token=? AND s.expires>?').get(hash(token), Date.now()) || null;
  }
  function requireCustomer(req) { return customer(req) || fail('Inicia sesión para continuar.', 401); }
  function session(res, id) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), id, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
  }
  function ticket(id) {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    const owner = db.prepare('SELECT name,email,phone FROM customers WHERE id=?').get(order.customer_id);
    const items = db.prepare('SELECT i.product_id AS id,p.name,i.quantity,i.price FROM items i JOIN products p ON p.id=i.product_id WHERE order_id=? ORDER BY p.id').all(id);
    return { ...order, customer: owner, items, total: items.reduce((sum, i) => sum + i.quantity * i.price, 0) };
  }
  async function body(req) {
    let data = '';
    for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 16384) fail('Solicitud demasiado grande.', 413); }
    try { const value = JSON.parse(data); if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Datos inválidos.'); return value; }
    catch { fail('Datos JSON inválidos.'); }
  }
  function saveOrder(user, input, id) {
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 5) fail('Elige al menos un postre.');
    const seen = new Set();
    for (const item of input.items) {
      if (!Number.isInteger(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 150 || seen.has(item.id)) fail('Las cantidades del pedido no son válidas.');
      seen.add(item.id);
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      if (id) {
        const old = db.prepare('SELECT * FROM orders WHERE id=? AND customer_id=?').get(id, user.id);
        if (!old) fail('Pedido no encontrado.', 404);
        if (input.version !== old.version) fail('Este pedido cambió. Abre el ticket actualizado antes de editarlo.', 409);
        for (const item of db.prepare('SELECT * FROM items WHERE order_id=?').all(id)) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity, item.product_id);
        db.prepare('DELETE FROM items WHERE order_id=?').run(id);
      }
      const products = input.items.map(item => {
        const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
        if (!p) fail('Postre no encontrado.');
        if (p.stock < item.quantity) fail(`Solo quedan ${p.stock} unidades de ${p.name}. Actualiza tu pedido.`, 409);
        return { ...p, quantity: item.quantity };
      });
      const now = new Date().toISOString();
      if (!id) id = Number(db.prepare('INSERT INTO orders (customer_id,created_at,updated_at) VALUES (?,?,?)').run(user.id, now, now).lastInsertRowid);
      else db.prepare('UPDATE orders SET updated_at=?,version=version+1 WHERE id=?').run(now, id);
      for (const p of products) {
        db.prepare('INSERT INTO items VALUES (?,?,?,?)').run(id, p.id, p.quantity, p.price);
        db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(p.quantity, p.id);
      }
      db.exec('COMMIT');
      return ticket(id);
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const attempts = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail('Origen no permitido.', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) fail('Se requiere JSON.', 415);
      }
      if (path === '/api/products' && req.method === 'GET') return send(db.prepare('SELECT * FROM products ORDER BY id').all());
      if (path === '/api/me' && req.method === 'GET') return send({ customer: customer(req) });
      if (['/api/register', '/api/login'].includes(path) && req.method === 'POST') {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        let rate = attempts.get(key);
        if (!rate || rate.until < now) { rate = { count: 0, until: now + 60000 }; attempts.set(key, rate); }
        if (++rate.count > 20) fail('Demasiados intentos. Espera un minuto.', 429);
        const input = await body(req);
        const email = String(input.email || '').trim().toLowerCase();
        const password = input.password;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) fail('Usa un correo válido y una contraseña de 8 a 128 caracteres.');
        let id;
        if (path === '/api/register') {
          const name = String(input.name || '').trim(); const phone = String(input.phone || '').trim();
          if (name.length < 2 || name.length > 100 || !/^[+\d ()-]{7,25}$/.test(phone)) fail('Escribe tu nombre y un teléfono válido.');
          if (db.prepare('SELECT id FROM customers WHERE email=?').get(email)) fail('Este correo ya está registrado. Inicia sesión.', 409);
          const salt = randomBytes(16).toString('hex');
          id = Number(db.prepare('INSERT INTO customers (name,email,phone,salt,password) VALUES (?,?,?,?,?)').run(name, email, phone, salt, scryptSync(password, salt, 64).toString('hex')).lastInsertRowid);
        } else {
          const found = db.prepare('SELECT * FROM customers WHERE email=?').get(email);
          const digest = scryptSync(password, found?.salt || 'missing-user', 64);
          if (!found || !timingSafeEqual(Buffer.from(found.password, 'hex'), digest)) fail('Correo o contraseña incorrectos.', 401);
          id = found.id;
        }
        session(res, id);
        return send({ customer: db.prepare('SELECT id,name,email,phone FROM customers WHERE id=?').get(id) });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.slice(8);
        if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send({ ok: true });
      }
      if (path === '/api/orders' && req.method === 'GET') { const user = requireCustomer(req); return send(db.prepare('SELECT id FROM orders WHERE customer_id=? ORDER BY id DESC').all(user.id).map(o => ticket(o.id))); }
      if (path === '/api/orders' && req.method === 'POST') return send(saveOrder(requireCustomer(req), await body(req)), 201);
      if (/^\/api\/orders\/\d+$/.test(path) && req.method === 'PUT') return send(saveOrder(requireCustomer(req), await body(req), Number(path.split('/').pop())));
      if (path.startsWith('/api/')) fail('Ruta no encontrada.', 404);
      if (req.method !== 'GET' && req.method !== 'HEAD') fail('Método no permitido.', 405);
      const file = path === '/' ? resolve(root, 'public/index.html') : resolve(root, 'public', '.' + decodeURIComponent(path));
      if (!file.startsWith(resolve(root, 'public') + '/') || !existsSync(file)) fail('Página no encontrada.', 404);
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      if (!types[extname(file)]) fail('Archivo no permitido.', 404);
      res.writeHead(200, { 'Content-Type': types[extname(file)] }); res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    } catch (error) { if (!error.status) console.error(error); send({ error: error.status ? error.message : 'Ocurrió un error. Intenta de nuevo.' }, error.status || 500); }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createApp(process.env.DB_PATH).listen(port, '0.0.0.0', () => console.log(`Antojitos de la abuela · puerto ${port}`));
}
