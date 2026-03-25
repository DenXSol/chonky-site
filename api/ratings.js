export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BASE = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;

  const headers = { Authorization: `Bearer ${TOKEN}` };

  async function get(key) {
    const r = await fetch(`${BASE}/get/${encodeURIComponent(key)}`, { headers });
    const j = await r.json();
    if (!j.result) return null;
    try { return JSON.parse(j.result); } catch { return j.result; }
  }

  async function set(key, val) {
    const r = await fetch(`${BASE}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(val))}`, {
      method: 'GET', headers
    });
    return r.json();
  }

  try {
    if (req.method === 'GET') {
      const data = await get('chonky_ratings');
      return res.status(200).json(data || {});
    }

    if (req.method === 'POST') {
      const { imgId, stars, voterKey } = req.body;
      if (!imgId || !stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'Bad request' });
      }

      // Check duplicate vote
      const voteKey = `v_${voterKey}_${imgId}`.slice(0, 90);
      const existing = await get(voteKey);
      if (existing !== null) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Mark voted
      await set(voteKey, stars);

      // Update ratings
      const ratings = (await get('chonky_ratings')) || {};
      if (!ratings[imgId]) ratings[imgId] = { total: 0, count: 0 };
      ratings[imgId].total += Number(stars);
      ratings[imgId].count += 1;
      await set('chonky_ratings', ratings);

      return res.status(200).json({ success: true, rating: ratings[imgId] });
    }

    return res.status(405).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
