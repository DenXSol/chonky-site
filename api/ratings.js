export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  async function kvGet(key) {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  }

  async function kvSet(key, value) {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value) })
    });
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
      const voteKey = `vote_${voterKey}_${imgId}`;
      const alreadyVoted = await kvGet(voteKey);
      if (alreadyVoted) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Save vote marker
      await kvSet(voteKey, stars);

      // Update ratings
      const ratings = await kvGet('chonky_ratings') || {};
      if (!ratings[imgId]) ratings[imgId] = { total: 0, count: 0 };
      ratings[imgId].total += stars;
      ratings[imgId].count += 1;
      await kvSet('chonky_ratings', ratings);

      return res.status(200).json({ success: true, rating: ratings[imgId] });
    }
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
