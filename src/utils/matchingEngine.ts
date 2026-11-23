import {
  Cita,
  Llamada,
  CruceAuditoria,
  ParametrosAuditoria,
  ResumenKPIs,
  VendedorMetricas,
  EstadoCumplimiento,
} from '../types';
import { esFechaProxima } from './dateHelpers';

/**
 * Normaliza un número telefónico extrayendo solo dígitos
 */
export function normalizarTelefono(tel?: string | number): string {
  if (!tel) return '';
  const s = String(tel).trim();
  if (s === 'null' || s === 'undefined') return '';
  return s.replace(/\D/g, '');
}

/**
 * Compara dos números telefónicos con tolerancia de sufijos
 * (últimos 8 dígitos para El Salvador / Guatemala / Centroamérica / México o 7 dígitos)
 */
export function coincideTelefono(tel1?: string | number, tel2?: string | number): boolean {
  if (!tel1 || !tel2) return false;
  const n1 = normalizarTelefono(tel1);
  const n2 = normalizarTelefono(tel2);
  if (!n1 || !n2) return false;

  // Coincidencia exacta completa
  if (n1 === n2) return true;

  // Uno contiene al otro
  if (n1.endsWith(n2) || n2.endsWith(n1)) return true;

  // Comparar últimos 8 dígitos (estándar Centroamérica y móviles)
  const suf1 = n1.length >= 8 ? n1.slice(-8) : n1;
  const suf2 = n2.length >= 8 ? n2.slice(-8) : n2;
  if (suf1.length >= 7 && suf2.length >= 7) {
    if (suf1 === suf2) return true;
    if (n1.endsWith(suf2) || n2.endsWith(suf1)) return true;
  }

  // Comparar últimos 7 dígitos
  if (n1.length >= 7 && n2.length >= 7) {
    if (n1.slice(-7) === n2.slice(-7)) return true;
  }

  return false;
}

/**
 * Compara si dos nombres de vendedor/asesor coinciden por token, usuario de catálogo o aproximación
 */
export function coincideVendedor(
  vendedor1?: string,
  vendedor2?: string,
  extension?: string,
  extensionAsesor?: string
): boolean {
  if (!vendedor1 || !vendedor2) return true; // Si falta en alguno, permitir match por teléfono

  const v1 = vendedor1.trim().toLowerCase();
  const v2 = vendedor2.trim().toLowerCase();

  // Si uno de los dos es genérico o no asignado, permitir
  if (
    v1.includes('asesor') ||
    v2.includes('asesor') ||
    v1.includes('linea') ||
    v2.includes('linea') ||
    v1 === 'ejecutivo' ||
    v2 === 'ejecutivo'
  ) {
    return true;
  }

  if (v1 === v2) return true;
  if (v1.includes(v2) || v2.includes(v1)) return true;

  // Comparar tokens (ej: "Anyelo" y "Anyelo Hernández")
  const tokens1 = v1.split(/\s+/).filter((t) => t.length > 2);
  const tokens2 = v2.split(/\s+/).filter((t) => t.length > 2);
  const intersect = tokens1.filter((t) => tokens2.includes(t));
  if (intersect.length >= 1) return true;

  return false;
}

/**
 * Parsea fechas ISO o YYYY-MM-DDTHH:mm:ss como hora reloj de El Salvador/Guatemala sin desfase de zona horaria del navegador.
 */
export function parseWallClockSV(fechaStr?: string | null): Date {
  if (!fechaStr) return new Date(NaN);
  const clean = String(fechaStr).trim();
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
    return new Date(
      parseInt(y, 10),
      parseInt(mo, 10) - 1,
      parseInt(d, 10),
      parseInt(h, 10),
      parseInt(mi, 10),
      parseInt(s, 10),
      0
    );
  }
  return new Date(clean);
}

function toSvWallClockIso(val?: string | null): string {
  if (!val) return '';
  const raw = String(val).trim();
  if (!raw) return '';
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const sv = new Date(d.getTime() - 6 * 3600 * 1000);
      const y = sv.getUTCFullYear();
      const m = String(sv.getUTCMonth() + 1).padStart(2, '0');
      const day = String(sv.getUTCDate()).padStart(2, '0');
      const hh = String(sv.getUTCHours()).padStart(2, '0');
      const mm = String(sv.getUTCMinutes()).padStart(2, '0');
      const ss = String(sv.getUTCSeconds()).padStart(2, '0');
      return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
    }
  }
  return raw;
}

/**
 * Clasifica el horario en que ingresó (se creó) el lead o llamada:
 * - Fin de Semana (Sábado o Domingo)
 * - Viernes Tarde (≥16:30)
 * - Horario Laboral (Lun–Jue 08:00–18:00, Vie 08:00–16:29)
 * - Fuera de Horario (Noche) (<08:00 o >18:00 L-V)
 */
export function clasificarHorarioIngreso(
  fechaIso?: string | null,
  horaInicioStr = '08:00',
  horaFinStr = '18:00'
): 'Horario Laboral' | 'Viernes Tarde (≥16:30)' | 'Fin de Semana' | 'Fuera de Horario (Noche)' {
  if (!fechaIso) return 'Horario Laboral';
  const d = parseWallClockSV(toSvWallClockIso(fechaIso));
  if (isNaN(d.getTime())) return 'Horario Laboral';

  const diaSemana = d.getDay(); // 0=Dom, 1=Lun, ..., 5=Vie, 6=Sab
  if (diaSemana === 0 || diaSemana === 6) {
    return 'Fin de Semana';
  }

  const [hIni, mIni] = horaInicioStr.split(':').map(Number);
  const [hFin, mFin] = horaFinStr.split(':').map(Number);
  const inicioMin = (hIni ?? 8) * 60 + (mIni ?? 0);
  const finMin = (hFin ?? 18) * 60 + (mFin ?? 0);
  const minutosDia = d.getHours() * 60 + d.getMinutes();

  if (minutosDia < inicioMin || minutosDia > finMin) {
    return 'Fuera de Horario (Noche)';
  }

  // Viernes desde las 16:30 se consideran para el lunes / siguiente día hábil
  if (diaSemana === 5 && minutosDia >= 16 * 60 + 30) {
    return 'Viernes Tarde (≥16:30)';
  }

  return 'Horario Laboral';
}

/**
 * Valida si una fecha/hora cae dentro del horario laboral efectivo:
 * Lun–Jue 08:00–18:00, Vie 08:00–16:29 (Viernes >= 16:30 y Fines de Semana se consideran fuera de horario).
 */
export function estaEnHorarioLaboral(
  fechaIso: string,
  horaInicioStr = '08:00',
  horaFinStr = '18:00'
): boolean {
  return clasificarHorarioIngreso(fechaIso, horaInicioStr, horaFinStr) === 'Horario Laboral';
}

/**
 * Obtiene el timestamp ISO de creación del lead (en reloj SV/GT) para tipificar su horario de ingreso.
 */
export function obtenerTimestampCreacionLead(cita?: Partial<Cita> | null): string {
  if (!cita) return '';
  if (cita.fecha_creado) {
    const h = cita.hora_creado ? String(cita.hora_creado).slice(0, 8) : '09:00:00';
    return `${String(cita.fecha_creado).slice(0, 10)}T${h}`;
  }
  if (cita.created_at) {
    return toSvWallClockIso(cita.created_at);
  }
  return cita.fecha_hora_programada || '';
}

/**
 * Calcula los minutos hábiles transcurridos entre inicioConteo y fechaCall
 * contando únicamente Lun–Vie dentro del horario laboral (sin contar noches ni sábados/domingos).
 */
export function calcularMinutosHabilesTranscurridos(
  inicioConteo: Date,
  fechaCall: Date,
  horaLaboralInicio = '08:00',
  horaLaboralFin = '18:00'
): number {
  if (fechaCall.getTime() <= inicioConteo.getTime()) return 0;

  const [hIni, mIni] = horaLaboralInicio.split(':').map(Number);
  const [hFin, mFin] = horaLaboralFin.split(':').map(Number);
  const iniH = hIni ?? 8;
  const iniM = mIni ?? 0;
  const finH = hFin ?? 18;
  const finM = mFin ?? 0;

  let totalMs = 0;
  const cursor = new Date(inicioConteo.getFullYear(), inicioConteo.getMonth(), inicioConteo.getDate(), 0, 0, 0, 0);
  const finDia = new Date(fechaCall.getFullYear(), fechaCall.getMonth(), fechaCall.getDate(), 0, 0, 0, 0);

  let guard = 0;
  while (cursor.getTime() <= finDia.getTime() && guard < 400) {
    guard++;
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const ventIni = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), iniH, iniM, 0, 0);
      const ventFin = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), finH, finM, 0, 0);
      const effIni = Math.max(ventIni.getTime(), inicioConteo.getTime());
      const effFin = Math.min(ventFin.getTime(), fechaCall.getTime());
      if (effFin > effIni) {
        totalMs += effFin - effIni;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.round(totalMs / 60000);
}

/**
 * Calcula el inicio efectivo de conteo y límite A Tiempo para un Lead No Calificado según reglas del Validador:
 * - VERDE (A Tiempo): hasta `toleranciaMin` (20 min incl.)
 * - AMARILLO (Tarde Leve): min 21 hasta < `umbralGraveMin` (119 min)
 * - ROJO (Tarde Grave): >= `umbralGraveMin` (120 min = 2 horas exactas incluidas)
 * - FIN DE SEMANA (Sáb/Dom): pasa a Lunes 08:00 AM
 * - VIERNES TARDE (>= 16:30): pasa a Lunes 08:00 AM
 * - FUERA DE HORARIO (Noche L-J >18:00 o <08:00): pasa a 08:00 AM del mismo/siguiente día hábil
 */
export function calcularLimiteLlamadaNoCalificado(
  fechaIngresoIso: string,
  horaLaboralInicio = '08:00',
  horaLaboralFin = '18:00',
  toleranciaMin = 20
): {
  inicioConteo: Date;
  fechaLimite: Date;
  dentroDeHorarioLaboral: boolean;
  horarioIngresoTipo: 'Horario Laboral' | 'Viernes Tarde (≥16:30)' | 'Fin de Semana' | 'Fuera de Horario (Noche)';
  plazoDescripcion: string;
} {
  const ingreso = parseWallClockSV(toSvWallClockIso(fechaIngresoIso));
  const horarioIngresoTipo = clasificarHorarioIngreso(fechaIngresoIso, horaLaboralInicio, horaLaboralFin);

  if (isNaN(ingreso.getTime())) {
    const ahora = new Date();
    return {
      inicioConteo: ahora,
      fechaLimite: new Date(ahora.getTime() + toleranciaMin * 60 * 1000),
      dentroDeHorarioLaboral: true,
      horarioIngresoTipo: 'Horario Laboral',
      plazoDescripcion: `≤ ${toleranciaMin} min (defecto)`,
    };
  }

  const [hIni, mIni] = horaLaboralInicio.split(':').map(Number);
  const [hFin, mFin] = horaLaboralFin.split(':').map(Number);
  const iniH = hIni ?? 8;
  const iniM = mIni ?? 0;
  const finMinutos = (hFin ?? 18) * 60 + (mFin ?? 0);
  const iniMinutos = iniH * 60 + iniM;

  if (horarioIngresoTipo === 'Horario Laboral') {
    const limite = new Date(ingreso.getTime() + toleranciaMin * 60 * 1000);
    return {
      inicioConteo: ingreso,
      fechaLimite: limite,
      dentroDeHorarioLaboral: true,
      horarioIngresoTipo,
      plazoDescripcion: `Hasta ${toleranciaMin} min (Horario Laboral)`,
    };
  }

  // Siguiente inicio hábil a las 08:00 AM
  const inicioConteo = new Date(ingreso);
  const diaSemana = ingreso.getDay(); // 0=Dom, 1=Lun, ..., 5=Vie, 6=Sab
  const minutosDia = ingreso.getHours() * 60 + ingreso.getMinutes();

  if (diaSemana === 5 && minutosDia >= 16 * 60 + 30) {
    // Viernes desde 16:30 -> Lunes 08:00 AM (+3 días)
    inicioConteo.setDate(inicioConteo.getDate() + 3);
  } else if (diaSemana === 5 && minutosDia < iniMinutos) {
    // Viernes antes de 08:00 AM -> mismo viernes 08:00 AM
  } else if (diaSemana === 6) {
    // Sábado -> Lunes 08:00 AM (+2 días)
    inicioConteo.setDate(inicioConteo.getDate() + 2);
  } else if (diaSemana === 0) {
    // Domingo -> Lunes 08:00 AM (+1 día)
    inicioConteo.setDate(inicioConteo.getDate() + 1);
  } else if (minutosDia > finMinutos) {
    // Lunes a Jueves después de 18:00 -> Día siguiente 08:00 AM
    inicioConteo.setDate(inicioConteo.getDate() + 1);
  }
  // Lunes a Jueves antes de 08:00 -> mismo día 08:00 AM

  inicioConteo.setHours(iniH, iniM, 0, 0);
  const limite = new Date(inicioConteo.getTime() + toleranciaMin * 60 * 1000);

  return {
    inicioConteo,
    fechaLimite: limite,
    dentroDeHorarioLaboral: false,
    horarioIngresoTipo,
    plazoDescripcion: `${horarioIngresoTipo} → Lunes/siguiente hábil ${horaLaboralInicio} (+${toleranciaMin}m)`,
  };
}

/**
 * Realiza el cruce entre una lista de citas/leads y las llamadas de todos los canales
 * (PBX, Celular, WhatsApp, Teams).
 *
 * Reglas unificadas del Validador:
 * - VERDE (A Tiempo): ≤ 20 min de retraso (minuto 20 incluido; Calificados también acepta -15m antes).
 * - AMARILLO (Tarde Leve): 21 a 119 min de retraso.
 * - ROJO (Tarde Grave): ≥ 120 min de retraso (2 horas exactas incluidas).
 * - FIN DE SEMANA / VIERNES ≥ 16:30 / NOCHE: Conteo corre desde el siguiente día hábil 08:00 AM.
 */
export function ejecutarCruceAuditoria(
  citas: Cita[],
  llamadas: Llamada[],
  parametros: ParametrosAuditoria
): CruceAuditoria[] {
  const cruces: CruceAuditoria[] = [];
  const llamadasUsadas = new Set<string>();

  const tolAntes = parametros.tolerancia_anticipacion_minutos ?? 15;
  const tolDespues = parametros.tolerancia_retraso_a_tiempo_minutos ?? 20;
  const umbralGrave = parametros.umbral_retraso_grave_minutos ?? 120;
  const hIni = parametros.horario_laboral_inicio || '08:00';
  const hFin = parametros.horario_laboral_fin || '18:00';

  // Pre-indexar llamadas en Map para O(1) instantáneo
  const mapaPorTel = new Map<string, Llamada[]>();
  const mapaPorNombre = new Map<string, Llamada[]>();

  llamadas.forEach((call) => {
    const rawTel = normalizarTelefono(call.telefono_marcado);
    if (rawTel.length >= 7) {
      const suf8 = rawTel.slice(-8);
      let arr8 = mapaPorTel.get(suf8);
      if (!arr8) {
        arr8 = [];
        mapaPorTel.set(suf8, arr8);
      }
      arr8.push(call);
    }

    if (call.prospecto_nombre) {
      const nom = call.prospecto_nombre.trim().toLowerCase();
      let arrN = mapaPorNombre.get(nom);
      if (!arrN) {
        arrN = [];
        mapaPorNombre.set(nom, arrN);
      }
      arrN.push(call);
    }
  });

  citas.forEach((cita) => {
    const esNoCalificado = cita.tipo_lead === 'no_calificados';
    const fechaCita = parseWallClockSV(cita.fecha_hora_programada);
    const esFechaValida = !isNaN(fechaCita.getTime());

    // Clasificar horario en que entró el lead (fecha/hora de creación)
    const tsCreacion = obtenerTimestampCreacionLead(cita);
    const horarioIngresoTipo = clasificarHorarioIngreso(tsCreacion, hIni, hFin);

    // Búsqueda ultra-rápida O(1) por teléfono o nombre
    const cleanTel = normalizarTelefono(cita.prospecto_telefono);
    const suf8 = cleanTel.length >= 7 ? cleanTel.slice(-8) : cleanTel;
    const porTel = (suf8 && mapaPorTel.get(suf8)) || [];
    const porNom = (cita.prospecto_nombre && mapaPorNombre.get(cita.prospecto_nombre.trim().toLowerCase())) || [];

    const poolUnico = new Set<Llamada>([...porTel, ...porNom]);
    const llamadasProspecto = Array.from(poolUnico);

    // 2. Leads No Calificados: 20 min Verde / 21-119 min Amarillo / >=120 min Rojo (desde inicioConteo hábil)
    if (esNoCalificado) {
      const { inicioConteo, dentroDeHorarioLaboral, plazoDescripcion } =
        calcularLimiteLlamadaNoCalificado(cita.fecha_hora_programada, hIni, hFin, tolDespues);

      let mejorLlamada: Llamada | undefined;
      let mejorFechaCall: Date | null = null;

      const llamadasMismoAsesor = llamadasProspecto.filter((c) =>
        coincideVendedor(cita.vendedor_nombre, c.vendedor_nombre)
      );

      const buscarPrimeraPosterior = (lista: Llamada[]) => {
        const ordenadas = [...lista].sort((a, b) => {
          return parseWallClockSV(a.fecha_hora_inicio).getTime() - parseWallClockSV(b.fecha_hora_inicio).getTime();
        });
        for (const c of ordenadas) {
          const fCall = parseWallClockSV(c.fecha_hora_inicio);
          if (!isNaN(fCall.getTime())) {
            if (!esFechaValida || fCall.getTime() >= fechaCita.getTime() - 15 * 60 * 1000) {
              return { call: c, fecha: fCall };
            }
          }
        }
        return null;
      };

      const encontrada =
        buscarPrimeraPosterior(llamadasMismoAsesor) ||
        buscarPrimeraPosterior(llamadasProspecto);

      if (encontrada) {
        mejorLlamada = encontrada.call;
        mejorFechaCall = encontrada.fecha;
      }

      if (mejorLlamada && mejorFechaCall) {
        llamadasUsadas.add(mejorLlamada.id);

        // Minutos hábiles de retraso desde el inicio efectivo de conteo (excluye noches, sábados, domingos y viernes >=16:30)
        const retrasoMin = esFechaValida
          ? calcularMinutosHabilesTranscurridos(inicioConteo, mejorFechaCall, hIni, hFin)
          : 0;

        let estado: EstadoCumplimiento = 'A_TIEMPO';
        let explicacion = '';

        if (retrasoMin >= umbralGrave) {
          estado = 'TARDE_GRAVE';
          explicacion = `Tarde Grave (Rojo): ${retrasoMin} min hábiles de retraso (≥ ${umbralGrave} min · ${plazoDescripcion}).`;
        } else if (retrasoMin > tolDespues) {
          estado = 'TARDE_LEVE';
          explicacion = `Tarde Leve (Amarillo): ${retrasoMin} min hábiles de retraso (entre ${tolDespues + 1} y ${umbralGrave - 1} min · ${plazoDescripcion}).`;
        } else {
          estado = 'A_TIEMPO';
          explicacion = `A Tiempo (Verde): contactado en ${retrasoMin} min hábiles (≤ ${tolDespues} min · ${plazoDescripcion}) por ${mejorLlamada.canal_tipo || mejorLlamada.proveedor}.`;
        }

        cruces.push({
          id: `cruce-${cita.id}`,
          cita,
          llamada: mejorLlamada,
          vendedor_id: cita.vendedor_id,
          vendedor_nombre: cita.vendedor_nombre,
          prospecto_nombre: cita.prospecto_nombre,
          telefono: cita.prospecto_telefono,
          pais: cita.pais || 'SV',
          fecha_cita: cita.fecha_hora_programada,
          fecha_llamada: mejorLlamada.fecha_hora_inicio,
          desfase_minutos: retrasoMin,
          duracion_llamada_segundos: mejorLlamada.duracion_segundos,
          estado_cumplimiento: estado,
          explicacion,
          canal_utilizado: mejorLlamada.canal_tipo || mejorLlamada.proveedor,
          fuera_de_horario: !dentroDeHorarioLaboral,
          horario_ingreso_tipo: horarioIngresoTipo,
          horario_creacion_str: tsCreacion,
        });
      } else {
        const esFutura = esFechaProxima(cita.fecha_hora_programada);
        const estado: EstadoCumplimiento = esFutura ? 'PENDIENTE' : 'NO_LLAMO';
        cruces.push({
          id: `cruce-${cita.id}`,
          cita,
          vendedor_id: cita.vendedor_id,
          vendedor_nombre: cita.vendedor_nombre,
          prospecto_nombre: cita.prospecto_nombre,
          telefono: cita.prospecto_telefono,
          pais: cita.pais || 'SV',
          fecha_cita: cita.fecha_hora_programada,
          estado_cumplimiento: estado,
          explicacion: esFutura
            ? `Lead pendiente de contactar (${cita.fecha_hora_programada.slice(0, 10)}). Fecha próxima.`
            : `No Llamó: no se encontró llamada posterior al ingreso (${cita.prospecto_telefono || 'sin teléfono'}). Regla: ${plazoDescripcion}.`,
          fuera_de_horario: !dentroDeHorarioLaboral,
          horario_ingreso_tipo: horarioIngresoTipo,
          horario_creacion_str: tsCreacion,
        });
      }

      return;
    }

    // 3. Leads Calificados:
    // Verde (A Tiempo): -15 a +20 min | Amarillo (Tarde Leve): 21 a 119 min | Rojo (Tarde Grave): >= 120 min
    let mejorLlamada: Llamada | undefined;
    let menorDiferenciaMs = Infinity;

    const llamadasMismoAsesor = llamadasProspecto.filter((c) =>
      coincideVendedor(cita.vendedor_nombre, c.vendedor_nombre)
    );

    const fProg =
      cita.fecha_agendada ||
      cita.fecha_creado ||
      (cita.fecha_hora_programada ? cita.fecha_hora_programada.slice(0, 10) : '');

    const misLlamadasMismoDia = llamadasMismoAsesor.filter((c) => {
      const fCall = c.fecha_hora_inicio ? c.fecha_hora_inicio.slice(0, 10) : '';
      return Boolean(fProg && fCall && fCall === fProg);
    });
    const todasLlamadasMismoDia = llamadasProspecto.filter((c) => {
      const fCall = c.fecha_hora_inicio ? c.fecha_hora_inicio.slice(0, 10) : '';
      return Boolean(fProg && fCall && fCall === fProg);
    });
    const llamadasMismoDia = misLlamadasMismoDia.length > 0 ? misLlamadasMismoDia : todasLlamadasMismoDia;

    if (llamadasMismoDia.length > 0) {
      llamadasMismoDia.forEach((candidata) => {
        const fechaLlamada = parseWallClockSV(candidata.fecha_hora_inicio);
        const diffMs = esFechaValida && !isNaN(fechaLlamada.getTime())
          ? Math.abs(fechaLlamada.getTime() - fechaCita.getTime())
          : 0;

        if (diffMs < menorDiferenciaMs) {
          menorDiferenciaMs = diffMs;
          mejorLlamada = candidata;
        }
      });
    } else {
      const fCreacionLead = (cita.fecha_creado || fProg || '').slice(0, 10);
      const basePool = llamadasMismoAsesor.length > 0 ? llamadasMismoAsesor : llamadasProspecto;
      const candidatasOtroDia = basePool
        .filter((c) => {
          const fCall = c.fecha_hora_inicio ? c.fecha_hora_inicio.slice(0, 10) : '';
          if (!fCall) return false;
          if (fCreacionLead && fCall < fCreacionLead) return false;
          return true;
        })
        .sort((a, b) => {
          const diffA = esFechaValida
            ? Math.abs(parseWallClockSV(a.fecha_hora_inicio).getTime() - fechaCita.getTime())
            : 0;
          const diffB = esFechaValida
            ? Math.abs(parseWallClockSV(b.fecha_hora_inicio).getTime() - fechaCita.getTime())
            : 0;
          return diffA - diffB;
        });

      if (candidatasOtroDia.length > 0) {
        mejorLlamada = candidatasOtroDia[0];
      }
    }

    const dentroDeHorarioLaboral = horarioIngresoTipo === 'Horario Laboral';

    if (mejorLlamada) {
      llamadasUsadas.add(mejorLlamada.id);
      const fechaLlamada = parseWallClockSV(mejorLlamada.fecha_hora_inicio);
      const fCallStr = mejorLlamada.fecha_hora_inicio ? mejorLlamada.fecha_hora_inicio.slice(0, 10) : '';

      if (fProg && fCallStr && fCallStr !== fProg) {
        cruces.push({
          id: `cruce-${cita.id}`,
          cita,
          llamada: mejorLlamada,
          vendedor_id: cita.vendedor_id,
          vendedor_nombre: cita.vendedor_nombre,
          prospecto_nombre: cita.prospecto_nombre,
          telefono: cita.prospecto_telefono,
          pais: cita.pais || 'SV',
          fecha_cita: cita.fecha_hora_programada,
          fecha_llamada: mejorLlamada.fecha_hora_inicio,
          desfase_minutos: undefined,
          duracion_llamada_segundos: mejorLlamada.duracion_segundos,
          estado_cumplimiento: 'LLAMO_OTRO_DIA',
          explicacion: `Llamó otro día: la cita estaba pactada para el ${fProg} y la llamada se realizó el ${fCallStr} por ${mejorLlamada.canal_tipo || mejorLlamada.proveedor}.`,
          canal_utilizado: mejorLlamada.canal_tipo || mejorLlamada.proveedor,
          fuera_de_horario: !dentroDeHorarioLaboral,
          horario_ingreso_tipo: horarioIngresoTipo,
          horario_creacion_str: tsCreacion,
        });
        return;
      }

      const desfaseMinutos = esFechaValida && !isNaN(fechaLlamada.getTime())
        ? Math.round((fechaLlamada.getTime() - fechaCita.getTime()) / (1000 * 60))
        : 0;

      let estado: EstadoCumplimiento = 'A_TIEMPO';
      let explicacion = '';

      if (desfaseMinutos >= umbralGrave) {
        estado = 'TARDE_GRAVE';
        explicacion = `Tarde Grave (Rojo): llamó +${desfaseMinutos} min después de la hora pactada (≥ ${umbralGrave} min).`;
      } else if (desfaseMinutos > tolDespues) {
        estado = 'TARDE_LEVE';
        explicacion = `Tarde Leve (Amarillo): llamó +${desfaseMinutos} min después (entre +${tolDespues + 1} y +${umbralGrave - 1} min).`;
      } else if (desfaseMinutos < -tolAntes) {
        estado = 'ADELANTADA';
        explicacion = `Adelantada: llamó ${Math.abs(desfaseMinutos)} min antes de la hora agendada (anticipación > ${tolAntes} min).`;
      } else {
        estado = 'A_TIEMPO';
        const detalle =
          desfaseMinutos === 0
            ? 'exacto en punto (a la hora acordada)'
            : desfaseMinutos > 0
            ? `+${desfaseMinutos} min después (≤ ${tolDespues} min incl.)`
            : `${Math.abs(desfaseMinutos)} min antes (dentro de tolerancia -${tolAntes} min)`;
        explicacion = `A Tiempo (Verde): ${detalle} por ${mejorLlamada.canal_tipo || mejorLlamada.proveedor}.`;
      }

      cruces.push({
        id: `cruce-${cita.id}`,
        cita,
        llamada: mejorLlamada,
        vendedor_id: cita.vendedor_id,
        vendedor_nombre: cita.vendedor_nombre,
        prospecto_nombre: cita.prospecto_nombre,
        telefono: cita.prospecto_telefono,
        pais: cita.pais || 'SV',
        fecha_cita: cita.fecha_hora_programada,
        fecha_llamada: mejorLlamada.fecha_hora_inicio,
        desfase_minutos: desfaseMinutos,
        duracion_llamada_segundos: mejorLlamada.duracion_segundos,
        estado_cumplimiento: estado,
        explicacion,
        canal_utilizado: mejorLlamada.canal_tipo || mejorLlamada.proveedor,
        fuera_de_horario: !dentroDeHorarioLaboral,
        horario_ingreso_tipo: horarioIngresoTipo,
        horario_creacion_str: tsCreacion,
      });
    } else {
      const esFutura = esFechaProxima(cita.fecha_agendada || cita.fecha_hora_programada);
      const estado: EstadoCumplimiento = esFutura ? 'PENDIENTE' : 'NO_LLAMO';
      const fProgLabel = cita.fecha_agendada || cita.fecha_hora_programada.slice(0, 10);
      const explicacion = esFutura
        ? `Cita agendada pendiente (${fProgLabel}). Fecha próxima.`
        : `No Llamó: no se encontró llamada al teléfono ${cita.prospecto_telefono || 'sin número'} ni Teams a la hora agendada.`;

      cruces.push({
        id: `cruce-${cita.id}`,
        cita,
        vendedor_id: cita.vendedor_id,
        vendedor_nombre: cita.vendedor_nombre,
        prospecto_nombre: cita.prospecto_nombre,
        telefono: cita.prospecto_telefono,
        pais: cita.pais || 'SV',
        fecha_cita: cita.fecha_hora_programada,
        estado_cumplimiento: estado,
        explicacion,
        fuera_de_horario: !dentroDeHorarioLaboral,
        horario_ingreso_tipo: horarioIngresoTipo,
        horario_creacion_str: tsCreacion,
      });
    }
  });

  return cruces;
}

/**
 * Calcula el resumen general de KPIs a partir de los cruces
 */
export function calcularResumenKPIs(cruces: CruceAuditoria[]): ResumenKPIs {
  const crucesConCita = cruces.filter((c) => !!c.cita);
  const totalCitas = crucesConCita.length;
  const totalLlamadas = cruces.filter((c) => !!c.llamada).length;

  const aTiempo = crucesConCita.filter((c) => c.estado_cumplimiento === 'A_TIEMPO').length;
  const tarde = crucesConCita.filter(
    (c) => c.estado_cumplimiento === 'TARDE_LEVE' || c.estado_cumplimiento === 'TARDE_GRAVE'
  ).length;
  const noLlamo = crucesConCita.filter((c) => c.estado_cumplimiento === 'NO_LLAMO').length;
  const pendientes = crucesConCita.filter((c) => c.estado_cumplimiento === 'PENDIENTE').length;
  const llamadaCorta = crucesConCita.filter(
    (c) => c.estado_cumplimiento === 'LLAMADA_CORTA'
  ).length;

  // Los pendientes no penalizan el cumplimiento porque su cita no ha llegado todavía
  const totalAuditables = totalCitas - pendientes;
  const tasaCumplimiento = totalAuditables > 0 ? Math.round((aTiempo / totalAuditables) * 100) : (totalCitas > 0 ? 100 : 0);

  let segTotales = 0;
  let sumaDesfases = 0;
  let conteoDesfases = 0;

  cruces.forEach((c) => {
    if (c.duracion_llamada_segundos) {
      segTotales += c.duracion_llamada_segundos;
    }
    if (c.desfase_minutos !== undefined && c.cita) {
      sumaDesfases += Math.abs(c.desfase_minutos);
      conteoDesfases++;
    }
  });

  const duracionTotalHoras = Number((segTotales / 3600).toFixed(1));
  const promedioTiempoRespuesta =
    conteoDesfases > 0 ? Number((sumaDesfases / conteoDesfases).toFixed(1)) : 0;

  const shows = crucesConCita.filter((c) => c.cita?.estado_cita === 'asistio').length;
  const tasaShows = totalCitas > 0 ? Math.round((shows / totalCitas) * 100) : 0;

  return {
    total_citas: totalCitas,
    total_llamadas: totalLlamadas,
    citas_llamadas_a_tiempo: aTiempo,
    tasa_cumplimiento_general: tasaCumplimiento,
    citas_no_atendidas: noLlamo,
    citas_pendientes: pendientes,
    citas_con_retraso: tarde,
    citas_llamada_insuficiente: llamadaCorta,
    duracion_total_llamadas_horas: duracionTotalHoras,
    promedio_tiempo_respuesta_minutos: promedioTiempoRespuesta,
    tasa_shows_efectivos: tasaShows,
  };
}

/**
 * Calcula métricas individuales por vendedor a partir de los cruces
 */
export function calcularMetricasPorVendedor(cruces: CruceAuditoria[]): VendedorMetricas[] {
  const agrupado = new Map<string, CruceAuditoria[]>();

  cruces.forEach((cruce) => {
    const key = cruce.vendedor_nombre || 'Sin Asignar';
    if (!agrupado.has(key)) {
      agrupado.set(key, []);
    }
    agrupado.get(key)!.push(cruce);
  });

  const metricas: VendedorMetricas[] = [];

  agrupado.forEach((lista, nombreVendedor) => {
    const conCita = lista.filter((c) => !!c.cita);
    const conLlamada = lista.filter((c) => !!c.llamada);

    const totalCitas = conCita.length;
    const totalLlamadas = conLlamada.length;

    const aTiempo = conCita.filter((c) => c.estado_cumplimiento === 'A_TIEMPO').length;
    const tardeLeve = conCita.filter((c) => c.estado_cumplimiento === 'TARDE_LEVE').length;
    const tardeGrave = conCita.filter((c) => c.estado_cumplimiento === 'TARDE_GRAVE').length;
    const noLlamo = conCita.filter((c) => c.estado_cumplimiento === 'NO_LLAMO').length;
    const pendientes = conCita.filter((c) => c.estado_cumplimiento === 'PENDIENTE').length;
    const corta = conCita.filter((c) => c.estado_cumplimiento === 'LLAMADA_CORTA').length;

    const auditables = totalCitas - pendientes;
    const tasaCumplimiento = auditables > 0 ? Math.round((aTiempo / auditables) * 100) : (totalCitas > 0 ? 100 : 0);

    let sumaDesfase = 0;
    let cantDesfase = 0;
    let segTotal = 0;

    conCita.forEach((c) => {
      if (c.desfase_minutos !== undefined) {
        sumaDesfase += c.desfase_minutos;
        cantDesfase++;
      }
    });

    conLlamada.forEach((c) => {
      segTotal += c.duracion_llamada_segundos || 0;
    });

    const promedioDesfase = cantDesfase > 0 ? Number((sumaDesfase / cantDesfase).toFixed(1)) : 0;
    const duracionPromedio =
      totalLlamadas > 0 ? Number((segTotal / totalLlamadas / 60).toFixed(1)) : 0;

    const asistidas = conCita.filter((c) => c.cita?.estado_cita === 'asistio').length;
    const tasaAsistencia = totalCitas > 0 ? Math.round((asistidas / totalCitas) * 100) : 0;

    let score: 'Excelente' | 'Bueno' | 'Aceptable' | 'En Riesgo' | 'Crítico' = 'Aceptable';
    if (tasaCumplimiento >= 85) score = 'Excelente';
    else if (tasaCumplimiento >= 70) score = 'Bueno';
    else if (tasaCumplimiento >= 50) score = 'Aceptable';
    else if (tasaCumplimiento >= 30) score = 'En Riesgo';
    else score = 'Crítico';

    metricas.push({
      vendedor_id: nombreVendedor.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: nombreVendedor,
      rol: 'Account Executive',
      total_citas: totalCitas,
      total_llamadas: totalLlamadas,
      citas_a_tiempo: aTiempo,
      citas_tarde_leve: tardeLeve,
      citas_tarde_grave: tardeGrave,
      citas_no_llamo: noLlamo,
      citas_pendientes: pendientes,
      citas_llamada_corta: corta,
      tasa_cumplimiento_pct: tasaCumplimiento,
      promedio_desfase_minutos: promedioDesfase,
      duracion_promedio_minutos: duracionPromedio,
      tasa_asistencia_pct: tasaAsistencia,
      score_rendimiento: score,
    });
  });

  return metricas.sort((a, b) => b.total_citas - a.total_citas);
}
