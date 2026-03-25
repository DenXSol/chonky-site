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
    'Content-Type': 'application/json'
  };

  const base = `${SUPABASE_URL}/rest/v1`;

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${base}/ratings?select=img_id,total,count&limit=1000`, { headers });
      const rows = await r.json();
      const result = {};
      if (Array.isArray(rows)) {
        rows.forEach(row => {
          result[row.img_id] = { total: row.total, count: row.count };
        });
      }
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      // Manually parse body — Vercel doesn't auto-parse for plain JS functions
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      if (!body || typeof body !== 'object') {
        // Try reading raw stream
        body = await new Promise((resolve) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { resolve({}); }
          });
        });
      }

      const { imgId, stars, voterKey } = body;
      console.log('POST body:', JSON.stringify({ imgId: imgId?.slice?.(0,40), stars, voterKey: voterKey?.slice?.(0,20) }));

      if (!imgId || !stars || Number(stars) < 1 || Number(stars) > 5) {
        return res.status(400).json({ error: 'Invalid params', received: { imgId: !!imgId, stars } });
      }

      const safeImgId = String(imgId).slice(0, 100);
      if (!voterKey || String(voterKey).trim() === '' || String(voterKey).trim() === 'anon') { return res.status(400).json({ error: 'Missing voterKey' }); }
      const safeVoterKey = String(voterKey).slice(0, 100);
      const safeStars = Number(stars);

      // Check duplicate vote
      const voteCheck = await fetch(
        `${base}/votes?voter_key=eq.${encodeURIComponent(safeVoterKey)}&img_id=eq.${encodeURIComponent(safeImgId)}&select=id&limit=1`,
        { headers }
      );
      const existingVotes = await voteCheck.json();
      console.log('Existing votes:', JSON.stringify(existingVotes));

      if (Array.isArray(existingVotes) && existingVotes.length > 0) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Insert vote
      const voteInsertRes = await fetch(`${base}/votes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ voter_key: safeVoterKey, img_id: safeImgId, stars: safeStars })
      });
      console.log('Vote insert status:', voteInsertRes.status);

      // Get existing rating
      const ratingCheckRes = await fetch(
        `${base}/ratings?img_id=eq.${encodeURIComponent(safeImgId)}&select=img_id,total,count&limit=1`,
        { headers }
      );
      const existingRatings = await ratingCheckRes.json();
      console.log('Existing rating:', JSON.stringify(existingRatings));

      let newTotal, newCount;

      if (Array.isArray(existingRatings) && existingRatings.length > 0) {
        newTotal = existingRatings[0].total + safeStars;
        newCount = existingRatings[0].count + 1;
        await fetch(
          `${base}/ratings?img_id=eq.${encodeURIComponent(safeImgId)}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ total: newTotal, count: newCount })
          }
        );
      } else {
        newTotal = safeStars;
        newCount = 1;
        const insertRes = await fetch(`${base}/ratings`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ img_id: safeImgId, total: newTotal, count: newCount })
        });
        console.log('Rating insert status:', insertRes.status);
      }

      console.log('Success:', { newTotal, newCount });
      return res.status(200).json({ success: true, rating: { total: newTotal, count: newCount } });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    console.error('Ratings error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
}
