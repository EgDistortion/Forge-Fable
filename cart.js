// ╔══════════════════════════════════════════════════════════════╗
// ║  Forge & Fable — Shared Cart System                        ║
// ║  Loaded by every page. Handles cart state, bundle pricing, ║
// ║  Stripe and PayPal checkout.                               ║
// ╚══════════════════════════════════════════════════════════════╝

const COIN_PRICE = 2.00;
const STRIPE_KEY = 'pk_live_51TdM3BGl0Jv4uGwwAsBquSAbFwscRRkXVEopNLNMHA4ZlKkjcxuFCUYsYc5rw7a1zS3YPpWdWZhBAUHdBBNSMe1800yodrINfi';

let cart = JSON.parse(localStorage.getItem('ff_cart') || '[]');

function saveCart() { localStorage.setItem('ff_cart', JSON.stringify(cart)); }

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

  container.innerHTML = cart.map(item => {
    const unit = item.isCoin ? effCoinPrice : item.price;
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
      const name = g.items[0]?.name?.split(' (')[0] || 'this item';
      savingsNote += `<div style="font-family:var(--serif);font-size:10px;color:var(--gold);letter-spacing:0.08em;text-align:right;margin-top:4px;">ADD 1 MORE ${name.toUpperCase()} FOR THE 2-FOR-$${g.bundlePrice} DEAL</div>`;
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
    const coinCount = cart.filter(i => i.isCoin).reduce((s, i) => s + i.qty, 0);
    const effCoinPrice = coinCount > 0 ? coinBundlePrice(coinCount) / coinCount : COIN_PRICE;
    const items = cart.map(i => ({
      name: i.name, theme: i.theme, qty: i.qty,
      price: i.isCoin ? Math.round(effCoinPrice * 100) / 100 : i.price
    }));
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
  const coinCount = cart.filter(i => i.isCoin).reduce((s, i) => s + i.qty, 0);
  const effCoinPrice = coinCount > 0 ? coinBundlePrice(coinCount) / coinCount : COIN_PRICE;
  const total = cart.reduce((s, i) => s + (i.isCoin ? effCoinPrice : i.price) * i.qty, 0);
  const items = cart.map(i => ({ name: i.name, quantity: i.qty, unitPrice: (i.isCoin ? effCoinPrice : i.price).toFixed(2), currency:'USD' }));
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
