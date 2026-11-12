// Serverless function para Vercel: /api/catalogo/[id]
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
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    return res.status(400).json({ exito: false, mensaje: 'ID de catálogo requerido.' });
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?id=eq.${encodeURIComponent(String(id))}`;

  try {
    if (req.method === 'PATCH') {
      const { nombre_ejecutivo, usuario, extension, celular, pais } = req.body || {};
      const payload: Record<string, any> = {};
      if (nombre_ejecutivo !== undefined) payload.nombre_ejecutivo = String(nombre_ejecutivo).trim();
      if (usuario !== undefined) payload.usuario = usuario ? String(usuario).trim() : null;
      if (extension !== undefined) payload.extension = extension ? String(extension).trim() : null;
      if (celular !== undefined) payload.celular = celular ? String(celular).trim() : null;
      if (pais !== undefined) payload.pais = pais ? String(pais).trim().toUpperCase() : 'SV';

      const response = await fetch(url, {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        return res.status(response.status).json({
          exito: false,
          mensaje: data?.message || data?.hint || `Error Supabase HTTP ${response.status}`,
          data,
        });
      }

      return res.status(200).json({ exito: true, data: Array.isArray(data) ? data[0] : data });
    }

    if (req.method === 'DELETE') {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: supabaseHeaders,
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        return res.status(response.status).json({
          exito: false,
          mensaje: data?.message || data?.hint || `Error Supabase HTTP ${response.status}`,
          data,
        });
      }

      return res.status(200).json({ exito: true, data });
    }

    return res.status(405).json({ exito: false, mensaje: 'Método no permitido' });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message || 'Error interno en /api/catalogo/[id]' });
  }
}
