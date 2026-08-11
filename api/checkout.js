// ╔══════════════════════════════════════════════════════════════╗
// ║  Vercel Serverless Function — Stripe Checkout               ║
// ║  Creates a Stripe Checkout session from cart items          ║
// ║                                                             ║
// ║  SETUP: Add STRIPE_SECRET_KEY to Vercel Environment Vars    ║
// ║  Settings → Environment Variables → STRIPE_SECRET_KEY       ║
// ╚══════════════════════════════════════════════════════════════╝

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ╔══════════════════════════════════════════════════════════════╗
// ║  SHIPPING                                                    ║
// ║  Free over $50. Otherwise weight-based brackets, priced      ║
// ║  against USPS Ground Advantage commercial rates (2026).      ║
// ║  Note: USPS consolidated all sub-1lb packages into one rate  ║
// ║  in July 2026, so there's no point splitting below a pound.  ║
// ╚══════════════════════════════════════════════════════════════╝
const FREE_SHIPPING_OVER = 50.00;

// Per-item weight estimates in ounces. Tune these against real
// postage receipts as you ship more — they only affect which
// bracket an order lands in, not the product prices.
const OZ = {
  currencyCoin: 0.046,  // 1.3 g each, measured
  resinCoin:    0.25,   // themed resin coin
  token:        0.50,   // MTG token, card-sized
  bookmark:     0.70,
  hueforge:     3.00,
  deckBox:      4.00,   // commander-sized FDM box
  packaging:    2.00,   // box + bubble wrap, added once per order
};

function estimateWeightOz(item){
  const name  = (item.name  || '').toLowerCase();
  const theme = (item.theme || '').toLowerCase();

  // Currency bags carry their count in the name, e.g. "(100-count bag)"
  const bag = name.match(/(\d+)\s*-?\s*count/);
  if(bag) return parseInt(bag[1], 10) * OZ.currencyCoin;

  if(theme.includes('deck box'))  return OZ.deckBox;
  if(theme.includes('bookmark'))  return OZ.bookmark;
  if(theme.includes('token'))     return OZ.token;
  if(theme.includes('hueforge'))  return OZ.hueforge;
  if(theme.includes('fulfillment')) return 0;   // shipping line from a quote
  return OZ.resinCoin;                          // coins are the default
}

function shippingOptionFor(items){
  const subtotal = items.reduce((s,i) => s + Number(i.price) * (i.qty || 1), 0);

  if(subtotal >= FREE_SHIPPING_OVER){
    return {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: 'usd' },
        display_name: 'Free Shipping (3–5 business days)',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 3 },
          maximum: { unit: 'business_day', value: 5 },
        },
      },
    };
  }

  const oz = items.reduce((s,i) => s + estimateWeightOz(i) * (i.qty || 1), 0) + OZ.packaging;

  let cents, label;
  if(oz <= 16)      { cents = 600;  label = 'Standard Shipping (3–5 business days)'; }
  else if(oz <= 32) { cents = 850;  label = 'Standard Shipping (3–5 business days)'; }
  else if(oz <= 64) { cents = 1100; label = 'Standard Shipping (3–5 business days)'; }
  else              { cents = 1350; label = 'Standard Shipping (3–5 business days)'; }

  return {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: cents, currency: 'usd' },
      display_name: label,
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 3 },
        maximum: { unit: 'business_day', value: 5 },
      },
    },
  };
}


module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers so your HTML page can call this
  res.setHeader('Access-Control-Allow-Origin', 'https://theforgeandfable.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { items, quoteRef } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Build Stripe line items from cart
    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.theme || 'The Forge & Fable',
          // Physical goods tax code — tells Stripe Tax to treat these as
          // tangible personal property, which is taxable in Ohio and most states.
          tax_code: 'txcd_99999999',
        },
        unit_amount: Math.round(item.price * 100), // Stripe uses cents
        // Exclusive = tax is added on top of the listed price, shown as a
        // separate line item at checkout. Required when using price_data
        // with automatic_tax — without this Stripe silently skips tax.
        tax_behavior: 'exclusive',
      },
      quantity: item.qty,
    }));

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      automatic_tax: { enabled: true }, // Stripe Tax — calculates Ohio sales tax
                                         // (and any other state where you're registered)
                                         // automatically based on the customer's address.
      customer_creation: 'always',       // Required for Stripe Tax — creates a Customer
                                         // record to store the shipping address, which is
                                         // how Stripe knows which tax rate to apply.
      success_url: 'https://theforgeandfable.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://theforgeandfable.com/shop.html',
      shipping_address_collection: {
        allowed_countries: ['US'], // add more if you ship internationally
      },
      shipping_options: [ shippingOptionFor(items) ],
      custom_text: {
        submit: {
          message: 'Orders are typically ready in 3–5 business days. We\'ll email you when your print is complete.',
        },
      },
      metadata: {
        source: quoteRef ? 'forge_and_fable_quote' : 'forge_and_fable_shop',
        ...(quoteRef ? { quote_ref: quoteRef } : {}),
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
};
