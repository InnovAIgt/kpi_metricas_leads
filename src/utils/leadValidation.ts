/**
 * Utilidades de validación y clasificación estricta de Leads.
 * Un lead calificado DEBE tener:
 * 1. Fecha agendada real (no nula ni inventada a partir de fecha_creado).
 * 2. Tipo de reunión válido (NO "(sin reunion)", "sin reunion", etc.; si viene null/"null" se asume "Llamada Telefonica").
 * 3. Nombre real del contacto o empresa (NO emojis solos como "😎", NO iniciales de 1 letra como "L", NO apodos informales como "El Amigo").
 */

/**
 * Normaliza el tipo de llamada / reunión proveniente de ProspektIA.
 * - Si viene null, "null", undefined, vacío o "(sin reunion)" -> "Llamada Telefonica" por defecto.
 * - Si trae algo diferente ("Virtual", "Llamada Virtual Teams", "Presencial", etc.) se respeta.
 */
export function normalizarTipoReunion(
  tipoReunion?: unknown,
  tipoLlamada?: unknown,
  tipoAlt?: unknown
): string {
  const candidatos = [tipoReunion, tipoLlamada, tipoAlt];
  for (const cand of candidatos) {
    if (cand === null || cand === undefined) continue;
    const raw = String(cand).trim();
    const lower = raw.toLowerCase();
    if (
      !raw ||
      lower === 'null' ||
      lower === 'undefined' ||
      lower === 'none' ||
      lower === 'n/a' ||
      lower === 'na' ||
      lower === '-' ||
      lower === '(sin reunion)' ||
      lower === 'sin reunion' ||
      lower === 'sin reunión'
    ) {
      continue;
    }
    return raw;
  }
  return 'Llamada Telefonica';
}

export function esTipoReunionVirtual(tipo?: unknown): boolean {
  const lower = String(tipo || '').toLowerCase().trim();
  return lower.includes('virtual') || lower.includes('teams');
}

export function esNombreValido(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  const raw = String(nombre).trim();

  // Descartar si tiene menos de 2 caracteres (ej: "L", "A")
  if (raw.length < 2) return false;

  // Extraer letras y números Unicode (excluye emojis, símbolos, espacios)
  const caracteresValidos = raw.match(/[\p{L}\p{N}]/gu) || [];
  if (caracteresValidos.length < 2) {
    // Es únicamente un emoji (ej: "😎", "🔥") o un símbolo
    return false;
  }

  // Descartar placeholders y apodos informales conocidos
  const normalizado = raw.toLowerCase();
  const placeholdersInvalidos = [
    'el amigo',
    'amigo',
    'elamigo',
    'amigo mio',
    'el compa',
    'prueba',
    'test',
    'tester',
    'asdf',
    'qwerty',
    'desconocido',
    'anonimo',
    'anónimo',
    'sin nombre',
    'no nombre',
    'lead',
  ];

  if (placeholdersInvalidos.includes(normalizado)) {
    return false;
  }

  return true;
}

export function tieneReunionAgendadaValida(lead: any): boolean {
  if (!lead) return false;

  // Validar fecha_agendada real (sin importar si tipo_reunion vino null o "(sin reunion)" cuando sí tiene fecha)
  const fAg = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
  if (!fAg || fAg.length < 8) return false;

  return true;
}

export function esLeadCalificadoValido(lead: any): boolean {
  if (!lead) return false;

  // Debe tener reunión agendada real
  if (!tieneReunionAgendadaValida(lead)) {
    return false;
  }

  // Debe tener nombre de contacto o empresa legítimo
  const nombre =
    lead.prospecto_nombre ||
    lead.nombre_prospecto ||
    lead.nombre ||
    lead.cliente ||
    lead.client_name ||
    '';

  if (!esNombreValido(nombre)) {
    return false;
  }

  return true;
}
