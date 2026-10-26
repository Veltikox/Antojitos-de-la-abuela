-- SQLite: estructura y cinco postres iniciales, sin clientes ni pedidos.
BEGIN TRANSACTION;
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
CREATE TABLE items (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0), price INTEGER NOT NULL, PRIMARY KEY(order_id,product_id));
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0), description TEXT NOT NULL, image TEXT NOT NULL);
INSERT INTO "products" VALUES(1,'Pay de queso',150,30,'Cremoso por dentro, doradito por fuera. Un clásico que abraza.','queso');
INSERT INTO "products" VALUES(2,'Queso napolitano',200,30,'Suave, delicado y bañado en nuestro caramelo de la casa.','napolitano');
INSERT INTO "products" VALUES(3,'Pay de vainilla',120,30,'Una base crujiente con el dulce aroma de la vainilla.','vainilla');
INSERT INTO "products" VALUES(4,'Budín',160,30,'La receta de siempre, con un toque de canela y mucho cariño.','budin');
INSERT INTO "products" VALUES(5,'Pastel',220,30,'Capas de chocolate para celebrar los pequeños grandes momentos.','pastel');
CREATE TABLE sessions (token TEXT PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), expires INTEGER NOT NULL);
COMMIT;
