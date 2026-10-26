# Antojitos de la abuela

Tienda de postres en español con HTML, CSS y JavaScript, servidor Node.js y SQLite persistente. Sin dependencias de ejecución externas.

## Iniciar

Requiere **Node.js 24 o superior**.

```sh
npm start
```

El servidor escucha en el puerto `3000` (configurable con `PORT`). Para desarrollo con reinicio automático: `npm run dev`. Abre la página mediante el servidor HTTP; abrir `index.html` directamente no conecta con la base de datos.

```sh
npm test
```

Las pruebas usan una base de datos temporal independiente. Comprueban registro, acceso, autorización, cálculos, validaciones, agotamiento, compras simultáneas, restitución del inventario al editar, conflictos de versiones y persistencia tras reiniciar.

## Funciones

- Cinco postres con imágenes ilustrativas generadas para esta tienda: pay de queso ($150), queso napolitano ($200), pay de vainilla ($120), budín ($160) y pastel de chocolate ($220). Precios en MXN.
- Treinta unidades iniciales de **cada postre**, creadas una sola vez. El servidor es la autoridad del stock. Los agotados siguen visibles, sin botón para agregarlos.
- Carrito limitado al stock disponible. El inventario se consulta al abrirlo, al recuperar la pestaña y cada 30 segundos; la confirmación siempre vuelve a validarlo.
- Registro de nombre, correo, teléfono y contraseña; acceso con correo y contraseña. Contraseñas derivadas mediante scrypt, sesiones con cookies HttpOnly y tokens almacenados como hash.
- Tickets con folio, fecha, cantidades, precios unitarios y total. Historial privado y botón de impresión (permite guardar PDF desde el navegador).
- Modificar un pedido restaura sus cantidades anteriores y descuenta las nuevas en una única transacción. Una edición inválida no altera el pedido ni el inventario. El control de versiones evita sobrescribir cambios hechos desde otra pestaña.
- Diseño adaptable a móvil y escritorio, navegación por teclado y diálogos accesibles.

## Base de datos y operación

Se incluye una [base SQLite inicial descargable](database/antojitos-inicial.sqlite), su [exportación SQL](database/antojitos-inicial.sql) y las [instrucciones de uso](database/README.md). Ambas contienen los cinco postres con 30 unidades de cada uno y ninguna cuenta ni pedido.

Se crea automáticamente en `data/shop.sqlite`, excluida de Git. Se puede elegir otra ubicación con `DB_PATH`. Conserva ese archivo y su volumen entre despliegues: borrar la base elimina clientes y pedidos y reinicia el stock. Para copias de seguridad con el servidor detenido, conserva el directorio `data` completo; SQLite usa WAL. Los datos de prueba no se incluyen en el repositorio.

Las cookies duran siete días. En un despliegue público utiliza HTTPS y `COOKIE_SECURE=true`. No se necesitan claves externas ni servicios de terceros. Las imágenes se sirven localmente.

Este flujo registra pedidos; **no procesa pagos**, no envía correos y no programa entregas. No incluye panel administrativo ni recuperación de contraseña. Los pedidos confirmados no caducan ni liberan inventario automáticamente. El carrito aún no confirmado se conserva solo en la pestaña abierta. Antes de operar públicamente, define el proceso de pago, entrega, reposición de inventario y respaldo de los datos.
