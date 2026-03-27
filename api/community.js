export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/community_images?order=approved_at.desc&limit=200`,
      { headers }
    );
    const rows = await r.json();
    if (!Array.isArray(rows)) return res.status(200).json([]);
    return res.status(200).json(rows);
  } catch(e) {
    console.error('Community error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
