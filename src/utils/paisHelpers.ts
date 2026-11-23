/**
 * Utilidades centralizadas de detección e inferencia de país (SV vs GT)
 * para leads (calificados y no calificados) y llamadas multicanal.
 */

export type CodigoPais = 'SV' | 'GT';

export function normalizarTextoComparacion(valor?: string | null): string {
  if (!valor) return '';
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizarCodigoPais(pais?: string | null): CodigoPais | null {
  if (!pais) return null;
  const clean = normalizarTextoComparacion(pais).toUpperCase();
  if (clean === 'GT' || clean === 'GUATEMALA' || clean === 'GUA') return 'GT';
  if (clean === 'SV' || clean === 'EL SALVADOR' || clean === 'SLV' || clean === 'ESA') return 'SV';
  return null;
}

/**
 * Infiere el país a partir del prefijo o rango numérico telefónico:
 * - +502 / 502... -> GT
 * - +503 / 503... -> SV
 * - 8 dígitos locales: [3, 4, 5] -> GT; [2, 6, 7] -> SV
 */
export function detectarPaisPorTelefono(tel?: string | number | null): CodigoPais | null {
  if (tel === undefined || tel === null) return null;
  const digits = String(tel).replace(/\D/g, '');
  if (!digits || digits.length < 7) return null;

  if (digits.startsWith('502')) return 'GT';
  if (digits.startsWith('503')) return 'SV';

  if (digits.length === 8) {
    if (['3', '4', '5'].includes(digits[0])) return 'GT';
    if (['2', '6', '7'].includes(digits[0])) return 'SV';
  }

  return null;
}

export interface MapaPaisCatalogo {
  porUsuario: Record<string, CodigoPais>;
  porNombre: Record<string, CodigoPais>;
  porExtension: Record<string, CodigoPais>;
  porCelular: Record<string, CodigoPais>;
}

export function construirMapaPaisCatalogo(catalogo: any[] = []): MapaPaisCatalogo {
  const mapa: MapaPaisCatalogo = {
    porUsuario: {},
    porNombre: {},
    porExtension: {},
    porCelular: {},
  };

  if (!Array.isArray(catalogo)) return mapa;

  catalogo.forEach((cat: any) => {
    const pais = normalizarCodigoPais(cat?.pais);
    if (!pais) return;

    if (cat.usuario && String(cat.usuario).trim() !== 'null') {
      mapa.porUsuario[normalizarTextoComparacion(cat.usuario)] = pais;
    }
    if (cat.nombre_ejecutivo && String(cat.nombre_ejecutivo).trim() !== 'null') {
      mapa.porNombre[normalizarTextoComparacion(cat.nombre_ejecutivo)] = pais;
    }
    if (cat.extension && String(cat.extension).trim() !== 'null') {
      String(cat.extension)
        .split(/[,;/|]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((ext) => {
          mapa.porExtension[ext] = pais;
        });
    }
    if (cat.celular && String(cat.celular).trim() !== 'null') {
      const celDigits = String(cat.celular).replace(/\D/g, '');
      if (celDigits.length >= 7) {
        mapa.porCelular[celDigits.length >= 8 ? celDigits.slice(-8) : celDigits] = pais;
      }
    }
  });

  return mapa;
}

export function detectarPaisPorAsesor(
  ident?: string | null,
  email?: string | null,
  catalogo: any[] = [],
  mapaPreconstruido?: MapaPaisCatalogo
): CodigoPais | null {
  if (email) {
    const emailLow = String(email).toLowerCase().trim();
    if (emailLow.endsWith('.gt') || emailLow.includes('.gt@')) return 'GT';
    if (emailLow.endsWith('.sv') || emailLow.includes('.sv@')) return 'SV';
  }

  if (!ident) return null;
  const norm = normalizarTextoComparacion(ident);
  if (!norm || norm === 'null' || norm === 'undefined') return null;

  const mapa = mapaPreconstruido || construirMapaPaisCatalogo(catalogo);
  if (mapa.porUsuario[norm]) return mapa.porUsuario[norm];
  if (mapa.porNombre[norm]) return mapa.porNombre[norm];
  if (mapa.porExtension[norm]) return mapa.porExtension[norm];

  const digits = norm.replace(/\D/g, '');
  if (digits.length >= 7) {
    const key = digits.length >= 8 ? digits.slice(-8) : digits;
    if (mapa.porCelular[key]) return mapa.porCelular[key];
  }

  // Coincidencia parcial por nombre / usuario normalizado (ej. "Lucía Conde" vs "Lucia Conde" o "Alexandra Londoño" vs "Alexandra Alondono")
  for (const [nomCat, paisCat] of Object.entries(mapa.porNombre)) {
    if (norm.includes(nomCat) || nomCat.includes(norm)) return paisCat;
    const tokensNorm = norm.split(/\s+/).filter((t) => t.length >= 4);
    const tokensCat = nomCat.split(/\s+/).filter((t) => t.length >= 4);
    if (tokensNorm.length > 0 && tokensCat.length > 0) {
      const comunes = tokensNorm.filter((t) => tokensCat.includes(t));
      if (comunes.length >= 2 || (comunes.length === 1 && tokensNorm.length === 1)) {
        return paisCat;
      }
    }
  }

  for (const [usrCat, paisCat] of Object.entries(mapa.porUsuario)) {
    if (usrCat.length >= 4 && norm.includes(usrCat)) return paisCat;
  }

  return null;
}

/**
 * Determina el país real (SV o GT) de un lead.
 * Prioridad:
 * 1. Campo explícito pais / country si viene válido de origen
 * 2. Prefijo telefónico (+502 / +503 o rango 8 dígitos de GT/SV)
 * 3. Email o país asignado al asesor en Catálogo
 * 4. Fallback 'SV'
 */
export function detectarPaisLead(
  lead: any,
  catalogo: any[] = [],
  mapaPreconstruido?: MapaPaisCatalogo,
  opciones?: { ignorarPaisExplicito?: boolean }
): CodigoPais {
  if (!lead) return 'SV';

  if (!opciones?.ignorarPaisExplicito) {
    const explicito = normalizarCodigoPais(lead.pais || lead.country);
    if (explicito) return explicito;
  }

  const porTel = detectarPaisPorTelefono(
    lead.telefono || lead.client_phone || lead.phone || lead.celular || lead.prospecto_telefono
  );
  if (porTel) return porTel;

  const porAsesor = detectarPaisPorAsesor(
    lead.asesor_nombre || lead.advisor_name || lead.vendedor_nombre || lead.asesor || lead.asesor_id,
    lead.asesor_email || lead.email,
    catalogo,
    mapaPreconstruido
  );
  if (porAsesor) return porAsesor;

  return 'SV';
}

export function detectarPaisLlamada(
  call: any,
  canal: 'PBX' | 'Celular' | 'Teams' | 'WhatsApp',
  catalogo: any[] = [],
  mapaPreconstruido?: MapaPaisCatalogo
): CodigoPais {
  if (!call) return 'SV';

  const explicito = normalizarCodigoPais(call.pais || call.country);
  if (explicito) return explicito;

  if (canal === 'Celular') {
    const op = normalizarTextoComparacion(call.operador).toUpperCase();
    if (op.includes('GT') || op.includes('GUATE')) return 'GT';
    if (op.includes('SV') || op.includes('SALVADOR')) return 'SV';

    const porLinea = detectarPaisPorTelefono(call.linea);
    if (porLinea) return porLinea;

    const porAsesor = detectarPaisPorAsesor(
      call.asesor_nombre || call.usuario || call.linea,
      undefined,
      catalogo,
      mapaPreconstruido
    );
    if (porAsesor) return porAsesor;

    const porDestino = detectarPaisPorTelefono(call.destino);
    if (porDestino) return porDestino;

    return 'SV';
  }

  if (canal === 'PBX') {
    const porAsesor = detectarPaisPorAsesor(
      call.extension || call.asesor_nombre || call.nombre,
      undefined,
      catalogo,
      mapaPreconstruido
    );
    if (porAsesor) return porAsesor;
    return detectarPaisPorTelefono(call.destino) || 'SV';
  }

  if (canal === 'Teams') {
    const porAsesor = detectarPaisPorAsesor(
      call.ejecutivo_nombre || call.ejecutivo,
      undefined,
      catalogo,
      mapaPreconstruido
    );
    if (porAsesor) return porAsesor;
    return detectarPaisPorTelefono(call.telefono) || 'SV';
  }

  // WhatsApp
  const porAsesor = detectarPaisPorAsesor(
    call.asesor_nombre || call.numero_ejecutivo || call.ejecutivo_id,
    undefined,
    catalogo,
    mapaPreconstruido
  );
  if (porAsesor) return porAsesor;
  return detectarPaisPorTelefono(call.numero_cliente || call.numero_ejecutivo) || 'SV';
}

/**
 * Obtiene la lista ordenada de ejecutivos válidos para un país ('TODOS' | 'SV' | 'GT'),
 * combinando el Catálogo oficial y los ejecutivos presentes en los cruces del mismo país.
 */
export function obtenerEjecutivosPorPais(
  catalogo: any[] = [],
  cruces: Array<{ vendedor_nombre?: string; pais?: string; cita?: { pais?: string } }> = [],
  paisFiltro: 'TODOS' | 'SV' | 'GT' = 'TODOS'
): string[] {
  const mapaNormACanonico = new Map<string, string>();
  const mapaPaisAsesor = new Map<string, CodigoPais>();

  (Array.isArray(catalogo) ? catalogo : []).forEach((cat: any) => {
    const nombre = String(cat?.nombre_ejecutivo || '').trim();
    const pais = normalizarCodigoPais(cat?.pais);
    if (!nombre || !pais) return;
    const norm = normalizarTextoComparacion(nombre);
    if (!norm) return;
    mapaPaisAsesor.set(norm, pais);
    if (paisFiltro === 'TODOS' || pais === paisFiltro) {
      if (!mapaNormACanonico.has(norm)) {
        mapaNormACanonico.set(norm, nombre);
      }
    }
  });

  (Array.isArray(cruces) ? cruces : []).forEach((c) => {
    const nombre = String(c?.vendedor_nombre || '').trim();
    if (!nombre) return;
    const norm = normalizarTextoComparacion(nombre);
    if (!norm) return;
    const paisLead = normalizarCodigoPais(c?.pais || c?.cita?.pais) || 'SV';
    const paisReal = mapaPaisAsesor.get(norm) || paisLead;
    if (paisFiltro === 'TODOS' || paisReal === paisFiltro) {
      if (!mapaNormACanonico.has(norm)) {
        mapaNormACanonico.set(norm, nombre);
      }
    }
  });

  return Array.from(mapaNormACanonico.values()).sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );
}

/**
 * Verifica si un nombre de ejecutivo (o usuario) coincide con el ejecutivo seleccionado en el filtro.
 */
export function coincideAsesorFiltro(
  asesorSeleccionado?: string | null,
  candidatoNombre?: string | null,
  catalogo: any[] = []
): boolean {
  if (!asesorSeleccionado || asesorSeleccionado === 'TODOS') return true;
  if (!candidatoNombre) return false;

  const selNorm = normalizarTextoComparacion(asesorSeleccionado);
  const candNorm = normalizarTextoComparacion(candidatoNombre);
  if (!selNorm || !candNorm) return false;
  if (selNorm === candNorm) return true;

  // Buscar aliases en catálogo para el ejecutivo seleccionado (usuario / nombre)
  for (const cat of catalogo || []) {
    const nomCat = normalizarTextoComparacion(cat?.nombre_ejecutivo);
    const usrCat = normalizarTextoComparacion(cat?.usuario);
    if (nomCat === selNorm || usrCat === selNorm) {
      if ((nomCat && candNorm === nomCat) || (usrCat && candNorm === usrCat)) {
        return true;
      }
    }
  }

  if (candNorm.includes(selNorm) || selNorm.includes(candNorm)) return true;

  const t1 = selNorm.split(/\s+/).filter((t) => t.length >= 3);
  const t2 = candNorm.split(/\s+/).filter((t) => t.length >= 3);
  if (t1.length >= 2 && t2.length >= 2) {
    const comunes = t1.filter((t) => t2.includes(t));
    if (comunes.length >= 2) return true;
  }

  return false;
}

