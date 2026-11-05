// Endpoint serverless para Vercel: /api/transcripciones/consultar
// Consulta en caliente al servidor de Issabel: http://200.35.189.133:3000/idata/api/v1/desaIssabel/getResumenLlamada

const ISSABEL_RESUMEN_URL = 'http://200.35.189.133:3000/idata/api/v1/desaIssabel/getResumenLlamada';
const cacheTranscripciones: { [key: string]: { data: any[]; timestamp: number } } = {};
const CACHE_TRANS_TTL = 60000; // 1 minuto de cache

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const {
      uniqueid = '',
      extension = '',
      nombre = '',
      destino = '',
      fecha = '',
      fechaInicial = '',
      fechaFinal = '',
      listar = 'false',
      estado = '',
      duracion = '',
    } = (req.query || {}) as Record<string, string>;

    // Detección inteligente de troncales / extensión invertida
    let cleanExt = String(extension || '').trim();
    let cleanDest = String(destino || '').trim();
    let cleanNombre = String(nombre || '').trim();

    if (cleanExt.length > 5 && cleanDest.length >= 3 && cleanDest.length <= 4) {
      const temp = cleanExt;
      cleanExt = cleanDest;
      cleanDest = temp;
    }

    // 1. Determinar rango de fechas para consultar a la API de Issabel
    let fIni = fechaInicial;
    let fFin = fechaFinal;

    if (!fIni || !fFin) {
      if (fecha) {
        const d = new Date(fecha.length === 10 ? `${fecha}T12:00:00Z` : fecha);
        if (!isNaN(d.getTime())) {
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          // Desde el 1 del mes hasta 4 días después de la fecha o fin de mes
          fIni = `${y}-${m}-01`;
          const dPost = new Date(d);
          dPost.setDate(dPost.getDate() + 4);
          fFin = dPost.toISOString().slice(0, 10);
        }
      }
    }

    if (!fIni || !fFin) {
      const hoy = new Date();
      const y = hoy.getUTCFullYear();
      const m = String(hoy.getUTCMonth() + 1).padStart(2, '0');
      fIni = `${y}-${m}-01`;
      fFin = hoy.toISOString().slice(0, 10);
    }

    const cacheKey = `${fIni}_${fFin}`;
    let llamadasInfo: any[] = [];

    if (cacheTranscripciones[cacheKey] && Date.now() - cacheTranscripciones[cacheKey].timestamp < CACHE_TRANS_TTL) {
      llamadasInfo = cacheTranscripciones[cacheKey].data;
    } else {
      const targetUrl = `${ISSABEL_RESUMEN_URL}?fechaInicial=${fIni}&fechaFinal=${fFin}`;
      const response = await fetch(targetUrl);
      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.info)) {
          llamadasInfo = json.info;
          cacheTranscripciones[cacheKey] = { data: llamadasInfo, timestamp: Date.now() };
        }
      }
    }

    // 2. Si se solicita listar o explorar llamadas
    if (listar === 'true' || (!uniqueid && !cleanDest && (cleanNombre || cleanExt))) {
      let filtradas = llamadasInfo;
      if (cleanNombre) {
        const nLower = cleanNombre.toLowerCase().trim();
        filtradas = filtradas.filter(
          (c) => c.nombre && c.nombre.toLowerCase().includes(nLower)
        );
      }
      if (cleanExt) {
        filtradas = filtradas.filter(
          (c) => String(c.extension).trim() === cleanExt
        );
      }
      return res.status(200).json({
        exito: true,
        total: filtradas.length,
        items: filtradas,
        fechaInicial: fIni,
        fechaFinal: fFin,
      });
    }

    // Auxiliar para llamadas relacionadas con transcripción
    const obtenerLlamadasRelacionadas = (extTarget: string, nomTarget: string) => {
      const conTrans = llamadasInfo.filter(
        (c) => Boolean(c.transcripcion && String(c.transcripcion).trim().length > 10)
      );

      let rel = conTrans.filter((c) => {
        if (extTarget && String(c.extension).trim() === extTarget) return true;
        if (nomTarget && c.nombre && c.nombre.toLowerCase().includes(nomTarget.toLowerCase())) return true;
        return false;
      });

      if (rel.length === 0) {
        rel = conTrans.slice(0, 8);
      } else {
        rel = rel.slice(0, 8);
      }
      return rel;
    };

    // 3. Buscar coincidencia exacta por uniqueid
    let match: any = null;

    if (uniqueid) {
      const idClean = String(uniqueid).trim();
      match = llamadasInfo.find((c) => String(c.uniqueid).trim() === idClean);
    }

    // Fallback 1: Buscar por teléfono destino limpio con validación estricta de fecha y asesor
    if (!match && cleanDest) {
      const destClean = cleanDest.replace(/[^0-9]/g, '').slice(-8);
      const targetDia = fecha ? fecha.slice(0, 10) : '';

      if (destClean.length >= 7) {
        match = llamadasInfo.find((c) => {
          const cDest = String(c.destino || '').replace(/[^0-9]/g, '').slice(-8);
          if (!cDest || cDest !== destClean) return false;

          // Si hay fecha target, debe coincidir exactamente el mismo día (YYYY-MM-DD)
          if (targetDia) {
            const cDia = String(c.fecha || c.fecha_hora || '').slice(0, 10);
            if (cDia && cDia !== targetDia) return false;
          }

          // Debe coincidir la extensión o el asesor para no cruzar llamadas de otros ejecutivos
          const coincideExt = Boolean(cleanExt && String(c.extension).trim() === cleanExt);
          const coincideNom = Boolean(cleanNombre && c.nombre && c.nombre.toLowerCase().includes(cleanNombre.toLowerCase()));

          if (cleanExt || cleanNombre) {
            return coincideExt || coincideNom;
          }

          return false;
        });
      }
    }

    // Fallback 2: Buscar por extensión y proximidad horaria
    if (!match && cleanExt && fecha) {
      const fHoraTarget = fecha.slice(0, 16);
      match = llamadasInfo.find((c) => {
        if (String(c.extension).trim() !== cleanExt) return false;
        if (c.fecha_hora && c.fecha_hora.slice(0, 16) === fHoraTarget) return true;
        return false;
      });
    }

    // 4. Si la llamada fue NO CONTESTADA o FALLIDA
    const estadoUpper = String(estado).toUpperCase();
    const durNum = Number(duracion || 0);
    if ((estadoUpper.includes('NO CONTESTADA') || estadoUpper.includes('OCUPADA') || estadoUpper.includes('FALLIDA') || durNum === 0) && (!match || !match.transcripcion)) {
      return res.status(200).json({
        exito: true,
        disponible: false,
        motivo: 'no_contestada',
        mensaje: 'Esta llamada no fue contestada (sin conversación de voz para transcribir)',
        detalle: `El conmutador registró la llamada como ${estadoUpper || 'Sin contestar'} (0s), por lo que no existió diálogo con el cliente para analizar.`,
        llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre),
      });
    }

    // 5. Si no se encontró ningún registro en el rango
    if (!match) {
      return res.status(200).json({
        exito: true,
        disponible: false,
        motivo: 'no_encontrada',
        mensaje: 'En 24 horas podrás consultar la transcripción de esta llamada',
        detalle: 'La llamada aún no ha sido procesada o indexada por el motor de inteligencia artificial.',
        llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre),
      });
    }

    // 6. Si se encontró, verificar si tiene transcripción
    const tieneTranscripcion = Boolean(
      match.transcripcion && String(match.transcripcion).trim().length > 5
    );

    if (!tieneTranscripcion) {
      return res.status(200).json({
        exito: true,
        disponible: false,
        motivo: 'en_proceso',
        mensaje: 'En 24 horas podrás consultar la transcripción de esta llamada',
        detalle: 'Las transcripciones y resúmenes QA de llamadas están disponibles 24 horas después de realizada la llamada.',
        registro: match,
        llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre),
      });
    }

    // 7. Transcripción y QA disponibles exitosamente
    return res.status(200).json({
      exito: true,
      disponible: true,
      registro: match,
      llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre).filter(
        (c) => c.uniqueid !== match.uniqueid
      ),
    });
  } catch (err: any) {
    return res.status(500).json({
      exito: false,
      mensaje: 'Error al consultar API de transcripciones: ' + (err?.message || String(err)),
    });
  }
}
