// ╔══════════════════════════════════════════════════════════════╗
// ║  Vercel Serverless Function — Stripe Checkout               ║
// ║  Creates a Stripe Checkout session from cart items          ║
// ║                                                             ║
// ║  SETUP: Add STRIPE_SECRET_KEY to Vercel Environment Vars    ║
// ║  Settings → Environment Variables → STRIPE_SECRET_KEY       ║
// ╚══════════════════════════════════════════════════════════════╝

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const { items } = req.body;

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
        },
        unit_amount: Math.round(item.price * 100), // Stripe uses cents
      },
      quantity: item.qty,
    }));

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: 'https://theforgeandfable.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://theforgeandfable.com/shop.html',
      shipping_address_collection: {
        allowed_countries: ['US'], // add more if you ship internationally
      },
      custom_text: {
        submit: {
          message: 'Orders are typically ready in 3–5 business days. We\'ll email you when your print is complete.',
        },
      },
      metadata: {
        source: 'forge_and_fable_shop',
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
};
