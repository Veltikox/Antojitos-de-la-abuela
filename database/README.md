# Base de datos de entrega

- **antojitos-inicial.sqlite**: base SQLite lista para usar, con todas las tablas y cinco postres con sus precios y 30 unidades de cada uno.
- **antojitos-inicial.sql**: la misma estructura y datos iniciales en texto SQL para inspeccionar o importar con SQLite. No es un script para MySQL.

Las tablas de clientes, sesiones, pedidos y detalle de pedidos están vacías. No se publican datos personales ni contraseñas. Puedes abrir el archivo `.sqlite` con DB Browser for SQLite.

## Usarla en la aplicación

Normalmente basta con ejecutar `npm start`: el servidor crea automáticamente `data/shop.sqlite` con los mismos datos iniciales.

Para usar la copia entregada en una instalación nueva, con el servidor detenido, crea la carpeta `data` y copia `antojitos-inicial.sqlite` dentro de ella con el nombre `shop.sqlite`. Después ejecuta `npm start` desde la raíz del repositorio. No reemplaces una base existente que ya contenga clientes o pedidos.

La aplicación debe trabajar sobre `data/shop.sqlite`, que está excluida de Git, y no sobre esta copia pública. Esta entrega es una base inicial fija: no refleja las ventas posteriores.

## Importar el SQL (opcional)

Con la herramienta de línea de comandos de SQLite instalada, desde la raíz del repositorio y usando un archivo nuevo:

```sh
sqlite3 nueva-tienda.sqlite < database/antojitos-inicial.sql
```

El archivo `.sqlite` ya está creado; no necesitas importar el SQL si usas esa copia o la creación automática del servidor.
