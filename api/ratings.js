export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  // Log to help debug
  console.log('SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('SUPABASE_KEY:', SUPABASE_KEY ? 'SET' : 'MISSING');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const base = `${SUPABASE_URL}/rest/v1`;

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${base}/ratings?select=img_id,total,count`, { headers });
      const rows = await r.json();
      console.log('GET ratings rows:', JSON.stringify(rows).slice(0, 200));
      const result = {};
      if (Array.isArray(rows)) {
        rows.forEach(row => { result[row.img_id] = { total: row.total, count: row.count }; });
      }
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { imgId, stars, voterKey } = req.body;
      console.log('POST vote:', { imgId: imgId?.slice(0,30), stars, voterKey: voterKey?.slice(0,20) });

      if (!imgId || !stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'Invalid params' });
      }

      // Check duplicate
      const voteCheck = await fetch(
        `${base}/votes?voter_key=eq.${encodeURIComponent(voterKey)}&img_id=eq.${encodeURIComponent(imgId)}&select=id`,
        { headers }
      );
      const existing = await voteCheck.json();
      console.log('Existing votes:', JSON.stringify(existing));

      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(200).json({ alreadyVoted: true });
      }

      // Insert vote
      const voteRes = await fetch(`${base}/votes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ voter_key: voterKey, img_id: imgId, stars: Number(stars) })
      });
      const voteData = await voteRes.json();
      console.log('Vote insert:', JSON.stringify(voteData).slice(0,100));

      // Get existing rating
      const ratingRes = await fetch(
        `${base}/ratings?img_id=eq.${encodeURIComponent(imgId)}&select=img_id,total,count`,
        { headers }
      );
      const ratingRows = await ratingRes.json();
      console.log('Rating rows:', JSON.stringify(ratingRows));

      let newTotal, newCount;

      if (Array.isArray(ratingRows) && ratingRows.length > 0) {
        newTotal = ratingRows[0].total + Number(stars);
        newCount = ratingRows[0].count + 1;
        const patchRes = await fetch(
          `${base}/ratings?img_id=eq.${encodeURIComponent(imgId)}`,
          { method: 'PATCH', headers, body: JSON.stringify({ total: newTotal, count: newCount }) }
        );
        console.log('Patch status:', patchRes.status);
      } else {
        newTotal = Number(stars);
        newCount = 1;
        const insertRes = await fetch(`${base}/ratings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ img_id: imgId, total: newTotal, count: newCount })
        });
        console.log('Insert status:', insertRes.status);
        const insertData = await insertRes.json();
        console.log('Insert data:', JSON.stringify(insertData).slice(0,100));
      }

      return res.status(200).json({ success: true, rating: { total: newTotal, count: newCount } });
    }
  } catch(e) {
    console.error('Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
