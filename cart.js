// ╔══════════════════════════════════════════════════════════════╗
// ║  Forge & Fable — Shared Cart System                        ║
// ║  Loaded by every page. Handles cart state, bundle pricing, ║
// ║  Stripe and PayPal checkout.                               ║
// ╚══════════════════════════════════════════════════════════════╝

const COIN_PRICE = 2.00;
const STRIPE_KEY = 'pk_live_51TdM3BGl0Jv4uGwwAsBquSAbFwscRRkXVEopNLNMHA4ZlKkjcxuFCUYsYc5rw7a1zS3YPpWdWZhBAUHdBBNSMe1800yodrINfi';

let cart = JSON.parse(localStorage.getItem('ff_cart') || '[]');

function saveCart() { localStorage.setItem('ff_cart', JSON.stringify(cart)); }

// Returns Stripe-ready line items whose cent amounts sum EXACTLY to the cart
// total shown to the customer. Bundle groups (coins, and TCG "2 for $X" deals)
// are split into two line items when the discount doesn't divide evenly, so
// there's never a penny of drift between the cart and the charge.
function getEffectivePricedItems() {
  const out = [];

  // Group cart lines into pricing groups: coins share one group, each TCG
  // bundleKey is its own group, everything else is priced individually.
  const groups = new Map();
  const singles = [];
  cart.forEach(item => {
    const key = item.isCoin ? '__coins__' : (item.bundleKey && item.bundlePrice ? item.bundleKey : null);
    if(!key){ singles.push(item); return; }
    if(!groups.has(key)) groups.set(key, { items: [], qty: 0, unitPrice: item.price, bundlePrice: item.bundlePrice, isCoin: !!item.isCoin });
    const g = groups.get(key);
    g.items.push(item);
    g.qty += item.qty;
  });

  // Non-bundled items bill at their listed price
  singles.forEach(i => out.push({ name: i.name, theme: i.theme, qty: i.qty, price: i.price }));

  groups.forEach(g => {
    // Total the group should cost, in whole cents
    const totalCents = g.isCoin
      ? Math.round(coinBundlePrice(g.qty) * 100)
      : Math.round((Math.floor(g.qty / 2) * g.bundlePrice + (g.qty % 2) * g.unitPrice) * 100);

    // Split evenly, then hand the leftover cents to the first N units so the
    // sum lands exactly on totalCents.
    const base = Math.floor(totalCents / g.qty);
    let extra = totalCents - base * g.qty;

    g.items.forEach(item => {
      let remaining = item.qty;
      if(extra > 0){
        const hi = Math.min(extra, remaining);
        out.push({ name: item.name, theme: item.theme, qty: hi, price: (base + 1) / 100 });
        extra -= hi;
        remaining -= hi;
      }
      if(remaining > 0){
        out.push({ name: item.name, theme: item.theme, qty: remaining, price: base / 100 });
      }
    });
  });

  return out;
}

function coinBundlePrice(n) {
  if(n <= 0) return 0;
  const tiers = [{min:10,price:15},{min:5,price:8},{min:3,price:5}];
  let total = 0;
  let remaining = n;
  while(remaining > 0) {
    const tier = tiers.find(t => remaining >= t.min);
    if(tier){ total += tier.price; remaining -= tier.min; }
    else { total += remaining * COIN_PRICE; remaining = 0; }
  }
  return total;
}

function addToCart(id, name, theme, price, btn) {
  const ex = cart.find(i => i.id === id);
  if(ex){ ex.qty++; } else { cart.push({id, name, theme, price, qty:1, isCoin:true}); }
  saveCart(); renderCart(); updateBadge(); renderPayPalButton();
  if(btn){
    btn.textContent = '✓ ADDED'; btn.classList.add('added');
    setTimeout(() => { btn.textContent = '+ CART'; btn.classList.remove('added'); }, 1500);
  }
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart(); renderCart(); updateBadge(); renderPayPalButton();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id); if(!item) return;
  item.qty = Math.max(0, item.qty + delta);
  if(item.qty === 0) cart = cart.filter(i => i.id !== id);
  saveCart(); renderCart(); updateBadge(); renderPayPalButton();
}

function updateBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cart-badge');
  if(badge){ badge.textContent = total; badge.classList.toggle('show', total > 0); }
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const foot = document.getElementById('cart-foot');
  if(!container) return;

  if(cart.length === 0){
    container.innerHTML = '<div class="cart-empty">Your cart is empty — <a href="shop.html" style="color:var(--gold);">browse the shop</a> to add items.</div>';
    if(foot) foot.style.display = 'none';
    return;
  }
  if(foot) foot.style.display = 'block';

  // Coin bundle pricing
  const coinCount = cart.filter(i => i.isCoin).reduce((s, i) => s + i.qty, 0);
  const coinTotal = coinBundlePrice(coinCount);
  const nonCoinItems = cart.filter(i => !i.isCoin);

  // TCG deck box bundle pricing (2 for $60)
  const bundleGroups = {};
  nonCoinItems.forEach(item => {
    if(item.bundleKey && item.bundlePrice){
      if(!bundleGroups[item.bundleKey]) bundleGroups[item.bundleKey] = { qty:0, unitPrice:item.price, bundlePrice:item.bundlePrice, items:[] };
      bundleGroups[item.bundleKey].qty += item.qty;
      bundleGroups[item.bundleKey].items.push(item);
    }
  });

  let bundleSavings = 0, bundleDiscountTotal = 0;
  Object.entries(bundleGroups).forEach(([key, g]) => {
    const pairs = Math.floor(g.qty / 2);
    const remainder = g.qty % 2;
    const discounted = pairs * g.bundlePrice + remainder * g.unitPrice;
    bundleSavings += (g.qty * g.unitPrice) - discounted;
    bundleDiscountTotal += discounted;
  });

  const nonBundleTotal = nonCoinItems.filter(i => !(i.bundleKey && i.bundlePrice)).reduce((s, i) => s + i.price * i.qty, 0);
  const total = coinTotal + nonBundleTotal + bundleDiscountTotal;
  const effCoinPrice = coinCount > 0 ? coinTotal / coinCount : COIN_PRICE;

  // Effective per-unit price for each TCG bundle group, so line items show
  // the discounted price rather than the full list price.
  const effBundleUnit = {};
  Object.entries(bundleGroups).forEach(([key, g]) => {
    const pairs = Math.floor(g.qty / 2);
    const remainder = g.qty % 2;
    const discountedTotal = pairs * g.bundlePrice + remainder * g.unitPrice;
    effBundleUnit[key] = discountedTotal / g.qty;
  });

  container.innerHTML = cart.map(item => {
    let unit = item.price;
    if(item.isCoin) unit = effCoinPrice;
    else if(item.bundleKey && effBundleUnit[item.bundleKey] !== undefined) unit = effBundleUnit[item.bundleKey];
    const line = unit * item.qty;
    return `<div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-meta">${item.theme} · $${unit.toFixed(2)} each</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty('${item.id}',-1)">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}',1)">+</button>
          <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</button>
        </div>
      </div>
      <div class="cart-item-price">$${line.toFixed(2)}</div>
    </div>`;
  }).join('');

  // Bundle savings hints
  let savingsNote = '';
  if(coinCount > 0){
    const saved = coinCount * COIN_PRICE - coinTotal;
    if(saved > 0){
      savingsNote += `<div style="font-family:var(--serif);font-size:10px;color:var(--green);letter-spacing:0.08em;text-align:right;margin-top:4px;">COIN BUNDLE SAVINGS: −$${saved.toFixed(2)}</div>`;
    } else if(coinCount < 3){
      const need = 3 - coinCount;
      savingsNote += `<div style="font-family:var(--serif);font-size:10px;color:var(--gold);letter-spacing:0.08em;text-align:right;margin-top:4px;">ADD ${need} MORE COIN${need > 1 ? 'S' : ''} FOR $5 BUNDLE</div>`;
    }
  }
  if(bundleSavings > 0){
    savingsNote += `<div style="font-family:var(--serif);font-size:10px;color:var(--green);letter-spacing:0.08em;text-align:right;margin-top:4px;">DECK BOX BUNDLE SAVINGS: −$${bundleSavings.toFixed(2)}</div>`;
  }
  Object.entries(bundleGroups).forEach(([key, g]) => {
    if(g.qty % 2 === 1){
      // Key format: game-type-style (or game-bookmarks). Describe the group
      // so the customer knows ANY item of that type completes the bundle.
      const parts = key.split('-');
      const label = parts.length >= 3 ? `${parts[2]} DECK BOX` : 'BOOKMARK';
      savingsNote += `<div style="font-family:var(--serif);font-size:10px;color:var(--gold);letter-spacing:0.08em;text-align:right;margin-top:4px;">ADD ANY 1 MORE ${label.toUpperCase()} FOR THE 2-FOR-$${g.bundlePrice} DEAL</div>`;
    }
  });

  document.getElementById('cart-total').textContent = '$' + total.toFixed(2);
  const totalRow = document.getElementById('cart-total').closest('.cart-subtotal');
  let noteEl = document.getElementById('cart-savings-note');
  if(!noteEl && totalRow){
    noteEl = document.createElement('div');
    noteEl.id = 'cart-savings-note';
    totalRow.parentNode.insertBefore(noteEl, totalRow.nextSibling);
  }
  if(noteEl) noteEl.innerHTML = savingsNote;

  renderPayPalButton();
}

function openCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if(overlay) overlay.classList.add('open');
  if(drawer) drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCart();
}

function closeCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if(overlay) overlay.classList.remove('open');
  if(drawer) drawer.classList.remove('open');
  document.body.style.overflow = '';
}

async function checkoutStripe() {
  if(!cart.length) return;
  const btn = document.getElementById('stripe-btn');
  btn.textContent = 'PREPARING...'; btn.disabled = true;
  try {
    const items = getEffectivePricedItems();
    const res = await fetch('/api/checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items}) });
    const data = await res.json();
    if(data.url){ window.location.href = data.url; }
    else throw new Error(data.error || 'No URL');
  } catch(err) {
    btn.textContent = '💳 CHECKOUT WITH CARD'; btn.disabled = false;
    alert('Checkout failed — please try PayPal or try again.');
  }
}

function renderPayPalButton() {
  const container = document.getElementById('paypal-cart-button-container');
  if(!container || !cart.length){ if(container) container.innerHTML = ''; return; }
  const priced = getEffectivePricedItems();
  const total = priced.reduce((s, i) => s + i.price * i.qty, 0);
  const items = priced.map(i => ({ name: i.name, quantity: i.qty, unitPrice: i.price.toFixed(2), currency:'USD' }));
  try {
    if(window.paypal && window.paypal.CartButton){
      container.innerHTML = '';
      window.paypal.CartButton({
        items, currency:'USD', amount: total.toFixed(2),
        onApprove: () => {
          cart = []; saveCart(); renderCart(); updateBadge();
          const foot = document.getElementById('cart-foot');
          if(foot) foot.innerHTML = `<div style="text-align:center;padding:2rem;font-family:var(--serif);color:var(--green);letter-spacing:0.1em;"><div style="font-size:16px;margin-bottom:8px;">PAYMENT COMPLETE</div><p style="font-size:14px;color:var(--muted);font-style:italic;">Thank you! We'll be in touch within 24 hours.</p></div>`;
        },
        onError: () => alert('PayPal error — please try again.')
      }).render('#paypal-cart-button-container');
    }
  } catch(e) {}
}

// Init on page load
document.addEventListener('DOMContentLoaded', () => {
  updateBadge();
  renderCart();
});
