export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // Upstash REST API - correct format
  async function kvGet(key) {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d = await r.json();
    if (d.result === null || d.result === undefined) return null;
    try { return JSON.parse(d.result); } catch { return d.result; }
  }

  async function kvSet(key, value) {
    const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([JSON.stringify(value)])
    });
    return r.json();
  }

  try {
    if (req.method === 'GET') {
      const ratings = await kvGet('chonky_ratings') || {};
      return res.status(200).json(ratings);
    }

    if (req.method === 'POST') {
      const { imgId, stars, voterKey } = req.body;
      if (!imgId || !stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'Invalid rating' });
      }

      // Check if already voted
      const voteKey = `v_${voterKey}_${imgId}`.slice(0, 100);
      const alreadyVoted = await kvGet(voteKey);
      if (alreadyVoted !== null) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Save vote marker
      await kvSet(voteKey, Number(stars));

      // Update global ratings
      const ratings = await kvGet('chonky_ratings') || {};
      if (!ratings[imgId]) ratings[imgId] = { total: 0, count: 0 };
      ratings[imgId].total += Number(stars);
      ratings[imgId].count += 1;
      await kvSet('chonky_ratings', ratings);

      return res.status(200).json({ success: true, rating: ratings[imgId] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    console.error('Ratings error:', e);
    return res.status(500).json({ error: e.message });
  }
}
