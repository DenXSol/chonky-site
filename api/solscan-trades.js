export default async function handler(req, res) {
  const { mint, limit = 100 } = req.query;

  if (!mint) {
    return res.status(400).json({ error: 'Missing mint address' });
  }

  try {
    const response = await fetch(
      `https://pro-api.solscan.io/v2.0/token/defi/activities?address=${mint}&activity_type=ACTIVITY_TOKEN_SWAP&sort_by=block_time&sort_order=desc&page_size=${limit}`,
      {
        headers: {
          token: process.env.SOLSCAN_API_KEY,
        },
      }
    );

    const data = await response.json();

    if (!data.success) {
      return res.status(500).json({ error: 'Solscan error', data });
    }

    // Normalize trades
    const trades = data.data.map((tx) => {
      const tokenIn = tx.token1;
      const tokenOut = tx.token2;

      return {
        id: tx.trans_id,
        time: tx.block_time,
        side: tokenOut?.symbol ? 'buy' : 'sell', // basic fallback (we'll refine later)
        amount: Number(tx.amount_info?.amount1 || 0),
        valueUsd: Number(tx.amount_info?.value || 0),
      };
    });

    res.status(200).json({ trades });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
