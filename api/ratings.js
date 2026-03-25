export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    if (req.method === 'GET') {
      // Get all ratings
      const r = await fetch(`${SUPABASE_URL}/rest/v1/ratings?select=img_id,total,count`, { headers });
      const rows = await r.json();
      const result = {};
      if (Array.isArray(rows)) {
        rows.forEach(row => { result[row.img_id] = { total: row.total, count: row.count }; });
      }
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { imgId, stars, voterKey } = req.body;
      if (!imgId || !stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'Invalid' });
      }

      // Check if already voted
      const voteCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/votes?voter_key=eq.${encodeURIComponent(voterKey)}&img_id=eq.${encodeURIComponent(imgId)}`,
        { headers }
      );
      const votes = await voteCheck.json();
      if (Array.isArray(votes) && votes.length > 0) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Save vote
      await fetch(`${SUPABASE_URL}/rest/v1/votes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ voter_key: voterKey, img_id: imgId, stars: Number(stars) })
      });

      // Upsert rating
      const existing = await fetch(
        `${SUPABASE_URL}/rest/v1/ratings?img_id=eq.${encodeURIComponent(imgId)}`,
        { headers }
      );
      const existingData = await existing.json();

      let newTotal, newCount;
      if (Array.isArray(existingData) && existingData.length > 0) {
        newTotal = existingData[0].total + Number(stars);
        newCount = existingData[0].count + 1;
        await fetch(`${SUPABASE_URL}/rest/v1/ratings?img_id=eq.${encodeURIComponent(imgId)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ total: newTotal, count: newCount })
        });
      } else {
        newTotal = Number(stars);
        newCount = 1;
        await fetch(`${SUPABASE_URL}/rest/v1/ratings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ img_id: imgId, total: newTotal, count: newCount })
        });
      }

      return res.status(200).json({ success: true, rating: { total: newTotal, count: newCount } });
    }
  } catch(e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
