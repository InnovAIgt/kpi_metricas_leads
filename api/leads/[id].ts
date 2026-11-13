// Serverless function para Vercel: /api/leads/[id]
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Prefer: 'return=representation',
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ exito: false, mensaje: 'Método no permitido' });
  }

  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    return res.status(400).json({ exito: false, mensaje: 'ID de lead requerido.' });
  }

  const tabla = req.query?.tabla === 'leads_no_calificados' ? 'leads_no_calificados' : 'leads';
  const campos = req.body || {};

  try {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
    const colFiltro = esUuid
      ? 'id'
      : tabla === 'leads_no_calificados'
      ? 'client_id'
      : 'codigo_prospecto';
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tabla}?${colFiltro}=eq.${encodeURIComponent(String(id))}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify(campos),
    });

    if (response.ok) {
      const data = await response.json().catch(() => []);
      return res.status(200).json({ exito: true, persisted: 'supabase', data });
    }

    const errTxt = await response.text().catch(() => '');
    return res.status(200).json({
      exito: true,
      persisted: 'client_cache',
      aviso_supabase: errTxt || `HTTP ${response.status}`,
      data: [{ id, ...campos }],
    });
  } catch (err: any) {
    return res.status(200).json({
      exito: true,
      persisted: 'client_cache',
      aviso_supabase: err?.message,
      data: [{ id, ...campos }],
    });
  }
}
