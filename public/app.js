const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const number = id => `AB-${String(id).padStart(5, '0')}`;
let products = [], user = null, cart = {}, editing = null, currentTicket = null, authMode = 'register', afterAuth = null, submitting = false;
let toastTimer;
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No pudimos completar la solicitud.');
  return data;
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function open(id) { const dialog = document.getElementById(id); if (!dialog.open) dialog.showModal(); }
function close(id) { document.getElementById(id).close(); }
function capacity(id) { return (products.find(p => p.id === id)?.stock || 0) + (editing?.items.find(i => i.id === id)?.quantity || 0); }
function items() { return Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => ({ id: Number(id), quantity })); }
function total() { return items().reduce((sum, item) => sum + (products.find(p => p.id === item.id)?.price || 0) * item.quantity, 0); }
function quantityControls(id, q) { return `<div class="quantity"><button data-change="${id}" data-delta="-1" aria-label="Quitar una unidad de ${escapeHTML(products.find(p => p.id === id).name)}">−</button><span aria-label="Cantidad">${q}</span><button data-change="${id}" data-delta="1" aria-label="Añadir una unidad de ${escapeHTML(products.find(p => p.id === id).name)}" ${q >= capacity(id) ? 'disabled' : ''}>+</button></div>`; }
function renderProducts() {
  $('#products').innerHTML = products.map((p, index) => {
    const available = capacity(p.id), q = cart[p.id] || 0;
    return `<article class="product"><div class="product-photo"><img src="/images/${p.image}.jpg" alt="${escapeHTML(p.name)}: ${escapeHTML(p.description)}" loading="lazy">${index === 0 ? '<span class="product-tag">El favorito de la casa ♡</span>' : index === 3 ? '<span class="product-tag">La receta de la abuela</span>' : ''}</div><div class="product-body"><div class="product-title"><h3>${escapeHTML(p.name)}</h3><span class="price">${money(p.price)}</span></div><p class="product-description">${escapeHTML(p.description)}</p><div class="product-bottom"><span class="stock">${available ? `${available} disponibles${editing ? ' para tu pedido' : ''}` : 'Agotado por ahora'}</span>${!available ? '<span class="sold-out">Pronto, más antojitos</span>' : q ? quantityControls(p.id, q) : `<button class="add-button" data-add="${p.id}">Agregar al carrito <span>+</span></button>`}</div></div></article>`;
  }).join('');
}
function renderCart() {
  const selected = items();
  const count = selected.reduce((sum, i) => sum + i.quantity, 0);
  $('#cart-count').textContent = count;
  $('#cart-button').setAttribute('aria-label', `Abrir carrito, ${count} postres`);
  $('#cart-title').textContent = editing ? 'Modificar mi pedido' : 'Tu carrito';
  $('#cart-items').innerHTML = selected.length ? selected.map(i => {
    const p = products.find(p => p.id === i.id);
    return `<div class="cart-line"><img src="/images/${p.image}.jpg" alt="${escapeHTML(p.name)}"><div class="cart-line-info"><h3>${escapeHTML(p.name)}</h3><p>${money(p.price)} por unidad · ${capacity(i.id)} disponibles</p>${quantityControls(i.id, i.quantity)}</div><button data-remove="${i.id}" class="remove-item" aria-label="Eliminar ${escapeHTML(p.name)} del carrito">×</button></div>`;
  }).join('') : '<div class="empty-state"><span>♡</span><h3>Aquí empieza un dulce momento.</h3><p>Agrega tu postre favorito al carrito.</p><button class="secondary" data-close="cart-dialog">Explorar los postres</button></div>';
  $('#cart-total').textContent = money(total());
  $('#checkout-button').disabled = !count || submitting;
  $('#checkout-button').textContent = submitting ? 'Guardando tu pedido…' : editing ? 'Guardar cambios y actualizar ticket →' : user ? 'Confirmar pedido y generar ticket →' : 'Continuar con mi pedido →';
  $('#edit-banner').hidden = !editing;
  if (editing) $('#edit-number').textContent = number(editing.id);
}
function render() { renderProducts(); renderCart(); }
function change(id, delta) {
  const next = (cart[id] || 0) + delta;
  if (next > capacity(id)) return toast('Ya elegiste todas las unidades disponibles de este postre.');
  if (next <= 0) delete cart[id]; else cart[id] = next;
  $('#cart-error').textContent = '';
  render();
}
async function refresh() { products = await api('/products'); render(); }
function syncAccount() { $('#account-button span').textContent = user ? user.name.split(' ')[0] : 'Mi cuenta'; }
function auth(mode = 'register', next = null) {
  afterAuth = next;
  $('#profile').hidden = !!(!user);
  $('#auth-form').hidden = !!user;
  $('#auth-error').textContent = '';
  if (user) {
    $('#auth-title').textContent = 'Qué gusto verte.';
    $('#profile').innerHTML = `<div class="profile-details"><strong>${escapeHTML(user.name)}</strong><p>${escapeHTML(user.email)}</p><p>${escapeHTML(user.phone)}</p></div><button class="primary full" id="profile-orders">Ver mis pedidos</button><button class="text-button full" id="logout">Cerrar sesión</button>`;
  } else setAuthMode(mode);
  open('account-dialog');
}
function setAuthMode(mode) {
  authMode = mode;
  $('#auth-title').textContent = mode === 'register' ? 'Un gusto conocerte.' : 'Bienvenido de vuelta.';
  document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('active', b.dataset.auth === mode));
  document.querySelectorAll('.register-field').forEach(label => { label.hidden = mode === 'login'; label.querySelector('input').required = mode === 'register'; });
  $('#auth-form [name=password]').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = mode === 'register' ? 'Crear mi cuenta →' : 'Iniciar sesión →';
  $('#auth-error').textContent = '';
}
async function checkout() {
  if (submitting || !items().length) return;
  if (!user) { close('cart-dialog'); auth('register', 'checkout'); return; }
  submitting = true; renderCart(); $('#cart-error').textContent = '';
  try {
    const order = await api(editing ? `/orders/${editing.id}` : '/orders', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ items: items(), version: editing?.version }) });
    cart = {}; editing = null; close('cart-dialog'); showTicket(order); toast('Tu pedido se guardó correctamente.');
    await refresh();
  } catch (error) {
    $('#cart-error').textContent = error.message;
    try { await refresh(); } catch { /* Preserve the original error. */ }
  } finally { submitting = false; renderCart(); }
}
function showTicket(order) {
  currentTicket = order;
  $('#ticket').innerHTML = `<div class="ticket-paper"><h3 class="ticket-brand">Antojitos de la abuela</h3><p class="ticket-subtitle">HECHOS CON CARIÑO</p><div class="ticket-success">✓ Pedido ${order.version > 1 ? 'actualizado' : 'registrado'} · Sin pago en línea</div><div class="ticket-meta"><strong>Ticket ${number(order.id)}</strong> · Versión ${order.version}<br>Creado: ${date(order.created_at)}${order.version > 1 ? `<br>Actualizado: ${date(order.updated_at)}` : ''}<br>Cliente: <strong>${escapeHTML(order.customer.name)}</strong><br>${escapeHTML(order.customer.email)}<br>Teléfono: ${escapeHTML(order.customer.phone)}</div><table class="ticket-table"><thead><tr><th>POSTRE / PRECIO UNITARIO</th><th>CANT.</th><th>IMPORTE</th></tr></thead><tbody>${order.items.map(i => `<tr><td>${escapeHTML(i.name)}<br><small>${money(i.price)}</small></td><td>${i.quantity}</td><td>${money(i.price * i.quantity)}</td></tr>`).join('')}</tbody></table><div class="total"><span>Total MXN</span><strong>${money(order.total)}</strong></div><p class="ticket-thanks">Gracias por compartir un dulce momento. ♡</p></div>`;
  close('orders-dialog'); open('ticket-dialog');
}
async function orders() {
  if (!user) return auth('login', 'orders');
  open('orders-dialog'); $('#orders-list').textContent = 'Buscando tus dulces momentos…';
  try {
    const list = await api('/orders');
    $('#orders-list').innerHTML = list.length ? list.map(o => `<div class="order-row"><div><strong>${number(o.id)} · ${money(o.total)}</strong><p>${date(o.updated_at)} · ${o.items.reduce((s, i) => s + i.quantity, 0)} postres</p><p>Versión ${o.version}</p></div><button class="secondary" data-order="${o.id}">Ver ticket</button></div>`).join('') : '<div class="empty-state"><span>♡</span><h3>Tu primer antojo te espera.</h3><p>Aquí aparecerán los tickets de tus pedidos.</p></div>';
    $('#orders-list').querySelectorAll('[data-order]').forEach(button => button.addEventListener('click', () => showTicket(list.find(o => o.id === Number(button.dataset.order)))));
  } catch (error) { $('#orders-list').textContent = error.message; }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.close) close(button.dataset.close);
  if (button.dataset.add) { change(Number(button.dataset.add), 1); toast('Un antojito más en tu carrito ♡'); }
  if (button.dataset.change) change(Number(button.dataset.change), Number(button.dataset.delta));
  if (button.dataset.remove) { delete cart[button.dataset.remove]; render(); }
  if (button.dataset.auth) setAuthMode(button.dataset.auth);
  if (button.id === 'logout') {
    try { await api('/logout', { method: 'POST', body: '{}' }); user = null; cart = {}; editing = null; syncAccount(); render(); close('account-dialog'); toast('Cerraste sesión. ¡Hasta pronto!'); }
    catch (error) { toast(error.message); }
  }
  if (button.id === 'profile-orders') { close('account-dialog'); orders(); }
});
$('#cart-button').addEventListener('click', async () => { open('cart-dialog'); try { await refresh(); } catch { $('#cart-error').textContent = 'No pudimos actualizar el inventario. Revisa tu conexión.'; } });
$('#account-button').addEventListener('click', () => auth());
$('#orders-button').addEventListener('click', orders);
$('#checkout-button').addEventListener('click', checkout);
$('#cancel-edit').addEventListener('click', () => { cart = {}; editing = null; render(); toast('Edición cancelada. Tu pedido anterior sigue guardado.'); });
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#auth-submit'); button.disabled = true; $('#auth-error').textContent = '';
  try {
    const data = await api(`/${authMode}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    user = data.customer; syncAccount(); event.target.reset(); close('account-dialog');
    if (afterAuth === 'orders') await orders();
    else if (afterAuth === 'checkout') { open('cart-dialog'); renderCart(); toast('Tu cuenta está lista. Revisa y confirma tu pedido.'); }
    else toast('¡Bienvenido a nuestra mesa!');
    afterAuth = null;
  } catch (error) { $('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#edit-ticket').addEventListener('click', async () => {
  if (items().length && !confirm('Para editar este pedido se reemplazará la selección actual de tu carrito. ¿Continuar?')) return;
  try {
    const list = await api('/orders');
    const latest = list.find(o => o.id === currentTicket.id);
    if (!latest) throw new Error('No se encontró este pedido.');
    products = await api('/products');
    editing = latest; cart = Object.fromEntries(latest.items.map(i => [i.id, i.quantity]));
    close('ticket-dialog'); render(); open('cart-dialog');
  } catch (error) { toast(error.message); }
});
$('#print-ticket').addEventListener('click', () => window.print());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh().catch(() => {}); });
setInterval(() => { if (document.visibilityState === 'visible' && !submitting) refresh().catch(() => {}); }, 30000);
$('#year').textContent = new Date().getFullYear();
async function init() {
  try { const [catalog, session] = await Promise.all([api('/products'), api('/me')]); products = catalog; user = session.customer; syncAccount(); render(); }
  catch { $('#products').innerHTML = '<div class="empty-state"><h3>No pudimos abrir la cocina.</h3><p>Revisa tu conexión y recarga la página para volver a intentarlo.</p></div>'; }
}
init();
