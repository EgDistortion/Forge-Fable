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
      // ── FLAT-RATE SHIPPING ──
      // Simple flat rate for now — revisit once you have real postage data
      // from actual orders (weight varies a lot between coin bags and minis).
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 600, currency: 'usd' }, // $6.00 flat
            display_name: 'Standard Shipping (3–5 business days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 5 },
            },
          },
        },
      ],
      custom_text: {
        submit: {
          message: 'Orders are typically ready in 3–5 business days. We\'ll email you when your print is complete.',
        },
      },
      metadata: {
        source: 'forge_and_fable_shop',
      },
    });

    // ── DEBUG LOGGING — remove once tax is confirmed working ──
    console.log('Stripe session created:', {
      id: session.id,
      automatic_tax: session.automatic_tax,
      customer_creation: session.customer_creation,
      amount_total: session.amount_total,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
};
