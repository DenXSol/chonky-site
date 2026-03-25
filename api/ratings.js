export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const base = `${SUPABASE_URL}/rest/v1`;

  // Truncate IDs to safe length
  function safeId(id) {
    return String(id).slice(0, 100);
  }

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${base}/ratings?select=img_id,total,count&limit=1000`, { headers });
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
        return res.status(400).json({ error: 'Invalid params' });
      }

      const safeImgId = safeId(imgId);
      const safeVoterKey = safeId(voterKey || 'anon');

      // Check duplicate vote
      const voteCheck = await fetch(
        `${base}/votes?voter_key=eq.${encodeURIComponent(safeVoterKey)}&img_id=eq.${encodeURIComponent(safeImgId)}&select=id&limit=1`,
        { headers }
      );
      const existingVotes = await voteCheck.json();

      if (Array.isArray(existingVotes) && existingVotes.length > 0) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Insert vote record
      await fetch(`${base}/votes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ voter_key: safeVoterKey, img_id: safeImgId, stars: Number(stars) })
      });

      // Check if rating exists
      const ratingCheck = await fetch(
        `${base}/ratings?img_id=eq.${encodeURIComponent(safeImgId)}&select=img_id,total,count&limit=1`,
        { headers }
      );
      const existingRating = await ratingCheck.json();

      let newTotal, newCount;

      if (Array.isArray(existingRating) && existingRating.length > 0) {
        newTotal = existingRating[0].total + Number(stars);
        newCount = existingRating[0].count + 1;
        await fetch(
          `${base}/ratings?img_id=eq.${encodeURIComponent(safeImgId)}`,
          { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ total: newTotal, count: newCount }) }
        );
      } else {
        newTotal = Number(stars);
        newCount = 1;
        await fetch(`${base}/ratings`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ img_id: safeImgId, total: newTotal, count: newCount })
        });
      }

      return res.status(200).json({ success: true, rating: { total: newTotal, count: newCount } });
    }

    return res.status(405).end();
  } catch(e) {
    console.error('Ratings error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
