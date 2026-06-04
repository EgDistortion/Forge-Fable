// ╔══════════════════════════════════════════════════════════════╗
// ║  Vercel Serverless Function — Stripe Payments Dashboard     ║
// ║  Returns recent payments and revenue stats for admin dash   ║
// ╚══════════════════════════════════════════════════════════════╝

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    // Get checkout sessions from last 30 days
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const sessions = await stripe.checkout.sessions.list({
      limit: 50,
      created: { gte: thirtyDaysAgo },
      expand: ['data.line_items', 'data.line_items.data.price.product', 'data.customer_details'],
    });

    // Build order list
    const orders = sessions.data
      .filter(s => s.payment_status === 'paid')
      .map((s, i) => {
        const items = s.line_items?.data?.map(li => ({
          name: li.price?.product_data?.name
             || li.description
             || li.price?.product?.name
             || 'Shop item',
          qty: li.quantity,
          amount: li.amount_total,
        })) || [];

        return {
          id: s.id,
          order_num: `#${String(sessions.data.length - i).padStart(3, '0')}`,
          customer: s.customer_details?.name || s.customer_details?.email || 'Customer',
          email: s.customer_details?.email || '',
          address: s.customer_details?.address || null,
          items,
          total: s.amount_total,
          currency: s.currency,
          date: new Date(s.created * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          timestamp: s.created,
          status: s.payment_status,
          shipping: s.shipping_details || null,
        };
      });

    // Revenue stats
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avgOrder = orders.length ? totalRevenue / orders.length : 0;

    // Last month comparison
    const fifteenDaysAgo = Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60);
    const recentOrders = orders.filter(o => o.timestamp >= fifteenDaysAgo);
    const olderOrders = orders.filter(o => o.timestamp < fifteenDaysAgo);
    const recentRev = recentOrders.reduce((s, o) => s + (o.total || 0), 0);
    const olderRev = olderOrders.reduce((s, o) => s + (o.total || 0), 0);
    const revDelta = olderRev > 0 ? ((recentRev - olderRev) / olderRev * 100).toFixed(0) : null;

    return res.status(200).json({
      orders,
      stats: {
        total_orders: orders.length,
        total_revenue: totalRevenue,
        avg_order: avgOrder,
        rev_delta: revDelta,
      }
    });

  } catch (err) {
    console.error('Stripe payments error:', err);
    return res.status(500).json({ error: err.message });
  }
};
