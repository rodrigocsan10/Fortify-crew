const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  },
  body: JSON.stringify(body),
});

const allowCors = (headers = {}) => ({
  ...headers,
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-fortify-passcode',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
});

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function safeEqParam(value) {
  // PostgREST eq filter; we only allow simple org codes to avoid weird characters.
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(value)) return null;
  return value;
}

async function supabaseGetSnapshot({ supabaseUrl, serviceKey, org }) {
  const url = `${supabaseUrl}/rest/v1/crew_snapshots?org_code=eq.${encodeURIComponent(org)}&select=org_code,rev,payload,updated_at`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase GET failed ${res.status}: ${t}`);
  }
  const rows = await res.json();
  return rows && rows[0] ? rows[0] : null;
}

async function supabaseUpsertSnapshot({ supabaseUrl, serviceKey, org, rev, payload }) {
  const url = `${supabaseUrl}/rest/v1/crew_snapshots`;
  const body = [{ org_code: org, rev, payload, updated_at: new Date().toISOString() }];
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase UPSERT failed ${res.status}: ${t}`);
  }
  const rows = await res.json();
  return rows && rows[0] ? rows[0] : null;
}

export async function handler(event) {
  try {
    const headers = allowCors();
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const pass = (event.headers['x-fortify-passcode'] || event.headers['X-Fortify-Passcode'] || '').trim();
    const expectedPass = requireEnv('FORTIFY_PASSCODE');
    if (!pass || pass !== expectedPass) return json(401, { error: 'Unauthorized' }, allowCors());

    const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const orgRaw = (event.queryStringParameters && event.queryStringParameters.org) || '';
    const org = safeEqParam(orgRaw);
    if (!org) return json(400, { error: 'Invalid org' }, allowCors());

    const fixedOrg = process.env.FORTIFY_ORG_CODE;
    if (fixedOrg && org !== fixedOrg) return json(403, { error: 'Forbidden org' }, allowCors());

    if (event.httpMethod === 'GET') {
      let snap = await supabaseGetSnapshot({ supabaseUrl, serviceKey, org });
      if (!snap) {
        snap = await supabaseUpsertSnapshot({ supabaseUrl, serviceKey, org, rev: 0, payload: {} });
      }
      return json(200, { org: snap.org_code, rev: snap.rev || 0, payload: snap.payload || {}, updatedAt: snap.updated_at || null }, allowCors());
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const payload = body && body.payload ? body.payload : {};

      const current = await supabaseGetSnapshot({ supabaseUrl, serviceKey, org });
      const nextRev = (current && typeof current.rev === 'number' ? current.rev : Number(current && current.rev) || 0) + 1;

      const saved = await supabaseUpsertSnapshot({ supabaseUrl, serviceKey, org, rev: nextRev, payload });
      return json(200, { ok: true, org, rev: saved.rev || nextRev, updatedAt: saved.updated_at || null }, allowCors());
    }

    return json(405, { error: 'Method not allowed' }, allowCors());
  } catch (err) {
    return json(500, { error: 'Server error', detail: String(err && err.message ? err.message : err) }, allowCors());
  }
}
