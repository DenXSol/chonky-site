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

    // ── GET — list all pending submissions ──
    if (req.method === 'GET') {
      const r = await fetch(
        `${base}/submissions?status=eq.pending&order=submitted_at.desc&limit=100`,
        { headers }
      );
      const rows = await r.json();
      if (!Array.isArray(rows)) return res.status(200).json([]);
      return res.status(200).json(rows);
    }

    // ── POST — new submission OR approve/reject ──
    if (req.method === 'POST') {
      // Parse body
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      if (!body || typeof body !== 'object') {
        body = await new Promise((resolve) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
        });
      }

      const { action } = body;

      // ── APPROVE ──
      if (action === 'approve') {
        const { id, caption, tags, category, twitter_handle } = body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        // Get the submission to get image_url
        const subRes = await fetch(
          `${base}/submissions?id=eq.${id}&limit=1`,
          { headers }
        );
        const subs = await subRes.json();
        if (!Array.isArray(subs) || subs.length === 0) {
          return res.status(404).json({ error: 'Submission not found' });
        }
        const sub = subs[0];

        // Insert into community_images
        const insertRes = await fetch(`${base}/community_images`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            twitter_handle: (twitter_handle || sub.twitter_handle || '').replace(/^@/, '').trim(),
            caption: caption || sub.caption || '',
            image_url: sub.image_url,
            tags: tags || sub.tags || [],
            category: category || 'gifs'
          })
        });

        if (!insertRes.ok) {
          const err = await insertRes.text();
          throw new Error('Insert to community_images failed: ' + err);
        }

        // Mark submission as approved
        await fetch(`${base}/submissions?id=eq.${id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() })
        });

        return res.status(200).json({ success: true });
      }

      // ── REJECT ──
      if (action === 'reject') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        await fetch(`${base}/submissions?id=eq.${id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status: 'rejected' })
        });

        return res.status(200).json({ success: true });
      }

      // ── NEW SUBMISSION ──
      const { twitter_handle, caption, image_url, tags, category } = body;

      if (!image_url) {
        return res.status(400).json({ error: 'Missing image_url' });
      }

      const insertRes = await fetch(`${base}/submissions`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          twitter_handle: (twitter_handle || '').replace(/^@/, '').trim(),
          caption: caption || '',
          image_url,
          tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
          category: category || 'gifs',
          status: 'pending'
        })
      });

      const inserted = await insertRes.json();
      if (!insertRes.ok) throw new Error(JSON.stringify(inserted));

      return res.status(200).json({ success: true, id: Array.isArray(inserted) ? inserted[0]?.id : inserted?.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(e) {
    console.error('Submit error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
