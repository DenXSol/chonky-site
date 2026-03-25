export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Missing env vars' });

  const sb = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
  const base = `${SUPABASE_URL}/rest/v1`;

  async function parseBody() {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    if (!body || typeof body !== 'object') {
      body = await new Promise(resolve => {
        let d = '';
        req.on('data', c => { d += c; });
        req.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
      });
    }
    return body || {};
  }

  try {
    // GET — fetch pending submissions for admin
    if (req.method === 'GET') {
      const r = await fetch(`${base}/submissions?select=*&status=eq.pending&order=submitted_at.desc&limit=100`, { headers: sb });
      const rows = await r.json();
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const body = await parseBody();
      const { action } = body;

      // Admin: APPROVE
      if (action === 'approve') {
        const { id, caption, tags, category } = body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        // Fetch submission
        const fetchRes = await fetch(`${base}/submissions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: sb });
        const rows = await fetchRes.json();
        if (!Array.isArray(rows) || rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const sub = rows[0];

        // Insert into community_images with any admin edits
        const insertRes = await fetch(`${base}/community_images`, {
          method: 'POST',
          headers: { ...sb, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            twitter_handle: sub.twitter_handle,
            caption: caption !== undefined ? caption : sub.caption,
            image_url: sub.image_url,
            tags: tags !== undefined ? tags : (sub.tags || []),
            category: category || sub.category || 'gifs'
          })
        });
        const inserted = await insertRes.json();
        console.log('Approved, inserted:', insertRes.status);

        // Mark submission as approved
        await fetch(`${base}/submissions?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { ...sb, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'approved' })
        });

        return res.status(200).json({ success: true, community_image: Array.isArray(inserted) ? inserted[0] : inserted });
      }

      // Admin: REJECT
      if (action === 'reject') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'Missing id' });
        await fetch(`${base}/submissions?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { ...sb, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'rejected' })
        });
        return res.status(200).json({ success: true });
      }

      // Public: new submission
      const { twitter_handle, caption, image_url, tags, category } = body;
      if (!image_url) return res.status(400).json({ error: 'Missing image_url' });

      const insertRes = await fetch(`${base}/submissions`, {
        method: 'POST',
        headers: { ...sb, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          twitter_handle: (twitter_handle || '').slice(0, 100),
          caption: (caption || '').slice(0, 280),
          image_url: image_url.slice(0, 2000),
          tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
          category: category || 'gifs',
          status: 'pending'
        })
      });
      const inserted = await insertRes.json();
      if (insertRes.status >= 400) return res.status(500).json({ error: 'Insert failed', detail: inserted });
      return res.status(200).json({ success: true, id: Array.isArray(inserted) ? inserted[0]?.id : inserted?.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    console.error('Submit error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
