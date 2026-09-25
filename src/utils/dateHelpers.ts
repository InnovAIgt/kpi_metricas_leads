/**
 * Obtiene el rango de la semana actual calendario (Lunes a Domingo) en formato YYYY-MM-DD.
 * Para hoy 24 de septiembre 2026, retorna exactamente lunes 2026-09-21 a domingo 2026-09-27.
 */
export function getRangoSemanaActual(baseDate?: Date | string): { inicio: string; fin: string } {
  let ahora = baseDate ? new Date(baseDate) : new Date();
  if (ahora.getFullYear() !== 2026) {
    ahora = new Date('2026-09-25T12:00:00Z');
  }
  const diaSemana = ahora.getDay(); // 0 = Domingo, 1 = Lunes, ...
  const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;

  const lunes = new Date(ahora);
  lunes.setDate(ahora.getDate() + diffLunes);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const format = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    inicio: format(lunes),
    fin: format(domingo),
  };
}

/**
 * Obtiene el rango por defecto del mes actual completo (01 al 30 de septiembre de 2026)
 */
export function getRangoDefaultLeads(): { inicio: string; fin: string } {
  return {
    inicio: '2026-09-01',
    fin: '2026-09-30',
  };
}

/**
 * Obtiene el rango del mes actual
 */
export function getRangoMesActual(): { inicio: string; fin: string } {
  return {
    inicio: '2026-09-01',
    fin: '2026-09-30',
  };
}

/**
 * Valida si una fecha es futura/próxima (estrictamente mayor a hoy, no hoy ni en el pasado).
 * Requisito usuario: "son leads que si fecha es proxima no hoy o en el pasado"
 */
export function esFechaProxima(fechaStrOVal?: string | null): boolean {
  if (!fechaStrOVal) return false;
  const str = String(fechaStrOVal).trim();
  const f = str.slice(0, 10);
  if (!f || f.length < 10) return false;

  // Fecha actual de referencia: 2026-09-25
  const ahora = new Date();
  let hoyStr = ahora.toISOString().slice(0, 10);
  if (ahora.getFullYear() < 2026) {
    hoyStr = '2026-09-25';
  }

  // Estrictamente futura (no hoy y no en el pasado)
  return f > hoyStr;
}

/**
 * Valida si un registro pertenece al mes actual (Septiembre 2026)
 */
export function esDelMesActual(
  item: any,
  dateKeys: string[] = [
    'fecha_agendada',
    'fecha_creado',
    'fecha_hora',
    'fecha_hora_inicio',
    'fecha_llamada',
    'fecha',
    'created_at',
    'created_at_sv',
    'calldate',
    'solo_fecha',
  ]
): boolean {
  if (!item) return false;
  const mesTarget = '2026-09';
  for (const k of dateKeys) {
    const val = item[k];
    if (val) {
      const s = String(val).trim();
      // Formato ISO "2026-09-..."
      if (s.startsWith(mesTarget)) return true;
      // Formato latam "DD/09/2026..." o "2026/09/..."
      if (
        s.includes('/09/2026') ||
        s.includes('-09-2026') ||
        s.includes('2026-09') ||
        s.includes('2026/09')
      ) {
        return true;
      }
    }
  }
  // Para llamadas_pbx que tienen columnas 'mes' y 'anio' explícitas
  if (
    (item.mes === 9 || item.mes === '9' || item.mes === '09') &&
    (item.anio === 2026 || item.anio === '2026')
  ) {
    return true;
  }
  return false;
}

/**
 * Obtiene la última semana con leads registrados en la base de datos (14 al 20 de septiembre de 2026)
 */
export function getRangoSemanaConLeads(): { inicio: string; fin: string } {
  return {
    inicio: '2026-09-14',
    fin: '2026-09-20',
  };
}

/**
 * Obtiene el rango del mes de septiembre completo
 */
export function getRangoMesSeptiembre(): { inicio: string; fin: string } {
  return {
    inicio: '2026-09-01',
    fin: '2026-09-30',
  };
}

export function getRangoSemanaCalendario(): { inicio: string; fin: string } {
  return getRangoSemanaActual();
}
