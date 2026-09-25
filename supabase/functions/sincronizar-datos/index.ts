import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-audio-proxy",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const BATCH_SIZE = 200;
const MAX_DAYS_PER_SYNC = 7; // Ventanas de hasta 7 días para evitar timeout en PBX (getCalls2)

// Generar ventanas automáticas de hasta 7 días entre fecha 'desde' y 'hasta'
function generarVentanasPbx(desde: string, hasta: string) {
  const inicio = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return [{ desde, hasta }];
  }

  const ventanas: { desde: string; hasta: string }[] = [];
  let cursor = new Date(inicio);

  while (cursor <= fin) {
    const ventanaInicio = new Date(cursor);
    const ventanaFin = new Date(cursor);
    ventanaFin.setUTCDate(ventanaInicio.getUTCDate() + MAX_DAYS_PER_SYNC - 1);
    ventanaFin.setUTCHours(23, 59, 59, 999);

    const rangoHasta = ventanaFin > fin ? new Date(fin) : new Date(ventanaFin);
    ventanas.push({
      desde: ventanaInicio.toISOString().slice(0, 10),
      hasta: rangoHasta.toISOString().slice(0, 10),
    });

    cursor = new Date(rangoHasta);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }

  return ventanas;
}

// Columnas autorizadas exactas de las tablas en Supabase
const COLUMNAS_PERMITIDAS: Record<string, string[]> = {
  leads: [
    "id",
    "codigo_prospecto",
    "nombre_prospecto",
    "telefono",
    "fecha_agendada",
    "hora_agendada",
    "fecha_creado",
    "hora_creado",
    "tipo_reunion",
    "pais",
    "asesor_id",
    "asesor_nombre",
    "asesor_email",
    "status",
    "created_at",
    "kpi_sla_etapa_1",
    "kpi_sla_etapa_2",
    "kpi_sla_etapa_3",
    "kpi_retroalimentacion_etapa_1",
    "kpi_retroalimentacion_etapa_2",
    "kpi_retroalimentacion_etapa_3",
    "kpi_retroalimentacion_etapa_4",
  ],
  leads_no_calificados: [
    "id",
    "client_id",
    "client_name",
    "advisor_name",
    "created_at",
    "created_at_sv",
    "updated_at",
    "telefono",
  ],
  llamadas_celular: [
    "id",
    "fecha",
    "hora",
    "destino",
    "duracion",
    "tipo",
    "linea",
    "usuario",
    "operador",
    "dia_consultado",
    "created_at",
  ],
  llamadas_pbx: [
    "id",
    "uniqueid",
    "nombre",
    "extension",
    "prefijo",
    "destino",
    "duracion_minutos",
    "duracion_segundos",
    "duracion_hh_mm_ss",
    "estado",
    "fecha_hora",
    "fecha",
    "anio",
    "mes",
    "dia",
    "pais",
    "fuente_llamada",
    "calificacion",
    "resumen_qa",
    "transcripcion",
    "created_at",
    "grabacion_url",
    "solo_fecha",
    "audio_url",
  ],
};

function filtrarColumnas(registros: any[], tabla: string) {
  const permitidas = COLUMNAS_PERMITIDAS[tabla];
  if (!permitidas) return registros;

  return registros.map((registro) => {
    const filtrado: Record<string, any> = {};
    for (const col of permitidas) {
      if (col in registro && registro[col] !== undefined) {
        filtrado[col] = registro[col];
      }
    }
    return filtrado;
  });
}

// Deduplica registros por una clave para evitar el error de Postgres:
// "ON CONFLICT DO UPDATE command cannot affect row a second time"
function deduplicarPorClave(registros: any[], clave: string) {
  const mapa = new Map<string, any>();
  for (const reg of registros) {
    if (!reg) continue;
    const k = String(reg[clave] ?? "").trim();
    if (!k || k === "null" || k === "undefined") continue;
    mapa.set(k, reg);
  }
  return Array.from(mapa.values());
}

async function hashEstable(texto: string): Promise<string> {
  const buffer = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// Genera un UUID v4 determinista válido a partir de un texto para la clave primaria de Supabase
async function hashAUuid(texto: string): Promise<string> {
  const buffer = new TextEncoder().encode(texto);
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function construirUniqueIdPbx(registro: any, fechaHora: string | null = null): Promise<string> {
  const nativo = String(registro?.uniqueid || registro?.UNIQUEID || "").trim();
  if (nativo && nativo.length > 5 && nativo !== "null" && nativo !== "undefined") {
    return nativo;
  }

  const extension = String(registro?.extension || registro?.EXTENSION || registro?.usuario || "").trim();
  const destino = String(registro?.destino || registro?.DESTINO || "").trim();
  const estado = String(registro?.estado || registro?.ESTADO || "").trim();
  const duracion = String(
    registro?.duracion_segundos ??
      registro?.duracion_minutos ??
      registro?.DURACION_MINUTOS ??
      registro?.duracion_hh_mm_ss ??
      ""
  ).trim();
  const fecha = fechaHora || String(registro?.fecha_hora || registro?.FECHA_HORA || registro?.fecha || "").trim();
  const pais = String(registro?.pais || registro?.PAIS || "").trim();

  const payload = `${extension}_${destino}_${fecha}_${duracion}_${estado}_${pais}`;
  return await hashEstable(payload);
}

function normalizarFechaHoraPbX(fecha: any, hora: any = null): string | null {
  if (fecha == null || fecha === "") return null;

  const rawFecha = String(fecha).trim();
  const rawHora = hora == null ? "" : String(hora).trim();
  const horaExtra = rawHora || rawFecha.match(/[T\s](\d{2}:\d{2}(?::\d{2})?)/)?.[1] || "";

  const isoFecha = rawFecha.includes("T") || rawFecha.includes(" ")
    ? rawFecha.replace(" ", "T")
    : rawFecha;

  if (/^\d{4}-\d{2}-\d{2}$/.test(isoFecha)) {
    return horaExtra ? `${isoFecha}T${horaExtra}` : `${isoFecha}T00:00:00`;
  }

  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(rawFecha)) {
    const [yyyy, mm, dd] = rawFecha.split(/[/-]/);
    return horaExtra ? `${yyyy}-${mm}-${dd}T${horaExtra}` : `${yyyy}-${mm}-${dd}T00:00:00`;
  }

  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(rawFecha)) {
    const [dd, mm, yyyy] = rawFecha.split(/[/-]/);
    return horaExtra ? `${yyyy}-${mm}-${dd}T${horaExtra}` : `${yyyy}-${mm}-${dd}T00:00:00`;
  }

  return rawFecha;
}

async function normalizarCallRow(registro: any, defaultPais: string = "SV") {
  if (!registro || typeof registro !== "object") return registro;

  const fechaRaw =
    registro.FECHA ||
    registro.fecha ||
    registro.FECHA_HORA ||
    registro.fecha_hora ||
    registro.SOLO_FECHA ||
    registro.solo_fecha ||
    null;
  const horaRaw =
    registro.HORA ||
    registro.hora ||
    registro.HORA_LLAMADA ||
    registro.hora_llamada ||
    null;

  const fechaHora = normalizarFechaHoraPbX(fechaRaw, horaRaw) || registro.fecha_hora || null;
  const soloFecha =
    registro.SOLO_FECHA ||
    registro.solo_fecha ||
    (fechaHora ? String(fechaHora).split("T")[0] : null);

  const fechaObj = fechaHora ? new Date(fechaHora) : null;
  const fechaValida = fechaObj && !isNaN(fechaObj.getTime());

  const rawExtension = registro.EXTENSION ?? registro.extension ?? registro.usuario ?? "";
  const extensionNormalizada = String(rawExtension).trim();
  const extensionLimpia = extensionNormalizada.replace(/[^0-9]/g, "");

  const paisDetectado = String(
    registro.PAIS ||
    registro.pais ||
    registro.country ||
    registro.pais_code ||
    defaultPais
  ).toUpperCase();

  const uniqueid = await construirUniqueIdPbx({ ...registro, pais: paisDetectado }, fechaHora);

  return {
    id: registro.id || crypto.randomUUID(),
    uniqueid: uniqueid,
    nombre: registro.NOMBRE || registro.nombre || null,
    extension: extensionLimpia || null,
    prefijo: registro.PREFIJO ?? registro.prefijo ?? null,
    destino: registro.DESTINO || registro.destino || null,
    duracion_minutos: registro.DURACION_MINUTOS || registro.duracion_minutos || null,
    duracion_segundos:
      registro.DURATION_SEC ??
      registro.duration_sec ??
      registro.duracion_segundos ??
      null,
    duracion_hh_mm_ss:
      registro.DURACION_HH_MM_SS || registro.duracion_hh_mm_ss || null,
    estado: registro.ESTADO || registro.estado || null,
    fecha_hora: fechaHora,
    fecha: soloFecha,
    solo_fecha: soloFecha,
    anio: registro.ANIO ?? registro.anio ?? (fechaValida ? fechaObj.getFullYear() : null),
    mes: registro.MES ?? registro.mes ?? (fechaValida ? fechaObj.getMonth() + 1 : null),
    dia: registro.DIA ?? registro.dia ?? (fechaValida ? fechaObj.getDate() : null),
    pais: paisDetectado,
    fuente_llamada: registro.fuente_llamada || "PBX",
    calificacion: registro.calificacion || null,
    resumen_qa: registro.resumen_qa || null,
    transcripcion: registro.transcripcion || null,
    audio_url: registro.audio_url || registro.grabacion_url || null,
    grabacion_url: registro.grabacion_url || registro.audio_url || null,
  };
}

function normalizarLead(registro: any) {
  const fAg = registro.fecha_agendada && registro.fecha_agendada !== "null" ? String(registro.fecha_agendada).trim() : null;
  const hAg = registro.hora_agendada && registro.hora_agendada !== "null" ? String(registro.hora_agendada).trim() : null;
  const fCr = registro.fecha_creado && registro.fecha_creado !== "null" ? String(registro.fecha_creado).trim() : null;
  const hCr = registro.hora_creado && registro.hora_creado !== "null" ? String(registro.hora_creado).trim() : null;

  let createdAt = registro.created_at;
  if (!createdAt && fCr) {
    createdAt = hCr ? `${fCr}T${hCr}Z` : `${fCr}T00:00:00Z`;
  }
  if (!createdAt) {
    createdAt = new Date().toISOString();
  }

  return {
    codigo_prospecto: String(registro.codigo_prospecto || registro.id || crypto.randomUUID()).trim(),
    nombre_prospecto: registro.nombre_prospecto || registro.nombre || "",
    telefono: String(registro.telefono || "").trim(),
    fecha_agendada: fAg,
    hora_agendada: hAg,
    fecha_creado: fCr,
    hora_creado: hCr,
    tipo_reunion: registro.tipo_reunion || "Llamada Telefonica",
    pais: registro.pais || "SV",
    asesor_id: registro.asesor_id ? String(registro.asesor_id) : null,
    asesor_nombre: registro.asesor_nombre || registro.ejecutivo || null,
    asesor_email: registro.asesor_email || null,
    status: registro.status || "en_proceso",
    created_at: createdAt,
    kpi_sla_etapa_1: registro.kpi_sla_etapa_1 ?? false,
    kpi_sla_etapa_2: registro.kpi_sla_etapa_2 ?? false,
    kpi_sla_etapa_3: registro.kpi_sla_etapa_3 ?? false,
    kpi_retroalimentacion_etapa_1: registro.kpi_retroalimentacion_etapa_1 ?? false,
    kpi_retroalimentacion_etapa_2: registro.kpi_retroalimentacion_etapa_2 ?? false,
    kpi_retroalimentacion_etapa_3: registro.kpi_retroalimentacion_etapa_3 ?? false,
    kpi_retroalimentacion_etapa_4: registro.kpi_retroalimentacion_etapa_4 ?? false,
  };
}

async function normalizarLeadNoCalificado(registro: any) {
  const telefono = String(
    registro?.client_phone ||
      registro?.phone ||
      registro?.phone_number ||
      registro?.telefono ||
      ""
  ).trim();
  const clientId = String(registro?.client_id || registro?.lead_id || "").trim();
  const createdAtSv = String(registro?.created_at_sv || "").trim();

  // Generar UUID determinista único para la clave primaria de public.leads_no_calificados
  const seed = `${clientId}_${createdAtSv}_${telefono}`;
  const idGenerado = await hashAUuid(seed);

  // Asegurar created_at siempre con valor válido (no null)
  let createdAt = registro?.created_at;
  if (!createdAt && createdAtSv) {
    const match = createdAtSv.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      const [, dd, mm, yyyy, hh, min, ampm] = match;
      let hourNum = parseInt(hh, 10);
      if (ampm?.toUpperCase() === "PM" && hourNum < 12) hourNum += 12;
      if (ampm?.toUpperCase() === "AM" && hourNum === 12) hourNum = 0;
      createdAt = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(hourNum).padStart(2, "0")}:${min}:00Z`;
    }
  }
  if (!createdAt) {
    createdAt = new Date().toISOString();
  }

  return {
    id: idGenerado,
    client_id: clientId || crypto.randomUUID(),
    client_name: registro?.client_name || registro?.nombre || "",
    advisor_name: registro?.advisor_name || registro?.ejecutivo || "",
    telefono: telefono,
    created_at: createdAt,
    created_at_sv: createdAtSv || null,
    updated_at: registro?.updated_at || createdAt,
  };
}

function extraerRegistros(responseData: any): any[] {
  if (!responseData) return [];
  if (Array.isArray(responseData)) return responseData;
  if (typeof responseData !== "object") return [];

  const posiblesClaves = [
    "info",
    "data",
    "records",
    "registros",
    "items",
    "rows",
    "leads",
    "calls",
    "llamadas",
  ];
  for (const clave of posiblesClaves) {
    if (Array.isArray(responseData[clave])) return responseData[clave];
  }

  for (const clave of Object.keys(responseData)) {
    const valor = responseData[clave];
    if (Array.isArray(valor)) return valor;
  }

  return [];
}

async function upsertEnLotes(
  supabase: any,
  tabla: string,
  registros: any[],
  onConflictCol: string
) {
  const errores: any[] = [];
  let insertados = 0;

  const registrosFiltrados = filtrarColumnas(registros, tabla);
  const primeraClave = onConflictCol.split(",")[0].trim();
  // Deduplicar antes del batch para que Postgres jamás lance:
  // "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const registrosDeduplicados = deduplicarPorClave(registrosFiltrados, primeraClave);

  const columnasClave = onConflictCol.split(",").map((col) => col.trim()).filter(Boolean);
  const validos = registrosDeduplicados.filter((r) =>
    columnasClave.every((col) => r?.[col] != null && String(r?.[col]).trim() !== "")
  );
  const sinClave = registrosFiltrados.length - validos.length;

  for (let i = 0; i < validos.length; i += BATCH_SIZE) {
    const lote = validos.slice(i, i + BATCH_SIZE);
    const respuesta = await supabase
      .from(tabla)
      .upsert(lote, { onConflict: onConflictCol, ignoreDuplicates: false, count: "exact" });

    const error = respuesta?.error || null;
    if (error) {
      errores.push({
        tabla,
        lote_desde: i,
        mensaje: error?.message || String(error),
        detalles: error?.details ?? null,
      });
    } else {
      insertados += lote.length;
    }
  }

  return { tabla, insertados, sinClave, errores };
}

async function obtenerJwtPbx(redPbxHost: string, username: string, password: string) {
  try {
    const r = await fetch(`${redPbxHost}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!r.ok) {
      return { token: null, error: `Login fallido: HTTP ${r.status}` };
    }

    const data = await r.json();
    return { token: data.token || data.jwt || data.access_token, error: null };
  } catch (err: any) {
    return { token: null, error: err.message };
  }
}

async function fetchApiConDiagnostico(nombre: string, url: string, opciones: any = {}) {
  try {
    const headers = {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      ...(opciones.headers || {}),
    };

    const r = await fetch(url, { ...opciones, headers });
    const textoCrudo = await r.text();

    if (!r.ok) {
      return {
        data: [],
        diagnostico: {
          fuente: nombre,
          ok: false,
          http_status: r.status,
          mensaje: `La API respondió HTTP ${r.status}`,
          cuerpo_respuesta: textoCrudo.slice(0, 400),
        },
      };
    }

    let json;
    try {
      json = JSON.parse(textoCrudo);
    } catch (parseErr: any) {
      return {
        data: [],
        diagnostico: {
          fuente: nombre,
          ok: false,
          http_status: r.status,
          mensaje: `Respuesta no es JSON válido: ${parseErr.message}`,
        },
      };
    }

    return {
      data: json,
      diagnostico: {
        fuente: nombre,
        ok: true,
        http_status: r.status,
        cuerpo_respuesta: textoCrudo.slice(0, 300),
      },
    };
  } catch (err: any) {
    return {
      data: [],
      diagnostico: {
        fuente: nombre,
        ok: false,
        http_status: null,
        mensaje: `Error: ${err.message}`,
      },
    };
  }
}

// Función para paginar automáticamente todos los leads no calificados de Prospektia
async function fetchTodosLeadsNoCalificados(apiKey: string): Promise<any[]> {
  const todos: any[] = [];
  let offset = 0;
  const limit = 1000;
  const maxPaginas = 5; // hasta 5,000 registros

  for (let p = 0; p < maxPaginas; p++) {
    const res = await fetchApiConDiagnostico(
      `leads_no_calificados_p${p + 1}`,
      `https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
        headers: { "X-API-Key": apiKey },
      }
    );
    const items = extraerRegistros(res.data);
    if (!items || items.length === 0) break;
    todos.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return todos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    let bodyRecibido: any = {};
    if (req.method === "POST") {
      try {
        bodyRecibido = await req.json();
      } catch (_) {
        bodyRecibido = {};
      }
    }

    // 1. Supabase nativo con Service Role Key para permisos de escritura completos
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://sbopifiiyezmvsadwkpg.supabase.co";
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "";

    const supabase = createClient(supabaseUrl, serviceKey);

    // 2. Cálculo dinámico de fechas
    // Por defecto toma desde el 1 de septiembre de 2026 para asegurar toda la data histórica del mes
    const fechaHoyIso = new Date().toISOString().slice(0, 10);
    const primerDiaMes = `${fechaHoyIso.slice(0, 7)}-01`;
    const defaultDesde = fechaHoyIso.startsWith("2026-09") ? "2026-09-01" : primerDiaMes;

    const fechaHasta = /^\d{4}-\d{2}-\d{2}$/.test(bodyRecibido?.pbx_hasta)
      ? bodyRecibido.pbx_hasta
      : fechaHoyIso;

    const fechaDesde = /^\d{4}-\d{2}-\d{2}$/.test(bodyRecibido?.pbx_desde)
      ? bodyRecibido.pbx_desde
      : defaultDesde;

    // Las credenciales de PBX se leen de las variables de entorno o del body
    const redPbxHost = Deno.env.get("RED_PBX_HOST") || bodyRecibido?.red_pbx_host || "https://api.red.com.sv";
    const pbxUsername = Deno.env.get("PBX_USERNAME") || Deno.env.get("USERNAME") || bodyRecibido?.pbx_username || "";
    const pbxPassword = Deno.env.get("PBX_PASSWORD") || Deno.env.get("PASSWORD") || bodyRecibido?.pbx_password || "";

    // Sincronizar AMBOS países ("SV" y "GT") por defecto para no omitir llamadas de Guatemala
    const paisParam = bodyRecibido?.pbx_pais ? String(bodyRecibido.pbx_pais).toUpperCase() : "AMBOS";
    const paisesASincronizar =
      paisParam === "SV" ? ["SV"] :
      paisParam === "GT" ? ["GT"] :
      ["SV", "GT"];

    const rangosPbx = generarVentanasPbx(fechaDesde, fechaHasta);

    let jwtPbx = "";
    if (pbxUsername && pbxPassword) {
      const loginResult = await obtenerJwtPbx(redPbxHost, pbxUsername, pbxPassword);
      jwtPbx = loginResult.token || "";
    }

    const headersPbx: any = { method: "GET" };
    if (jwtPbx) {
      headersPbx.headers = { Authorization: `Bearer ${jwtPbx}` };
    }

    // 3. Preparar consultas PBX para todos los países y ventanas
    const pbxRequests: Promise<any>[] = [];
    for (const pais of paisesASincronizar) {
      for (const ventana of rangosPbx) {
        pbxRequests.push(
          fetchApiConDiagnostico(
            `llamadas_pbx_${pais}`,
            `${redPbxHost}/pbx/api/v1/getCalls2?desde=${ventana.desde}&hasta=${ventana.hasta}&pais=${pais}`,
            headersPbx
          ).then(async (res) => {
            const items = extraerRegistros(res.data);
            const normalizados = await Promise.all(
              items.map((item) => normalizarCallRow(item, pais))
            );
            return normalizados;
          })
        );
      }
    }

    const prospektiaApiKey =
      Deno.env.get("PROSPEKTIA_API_KEY") ||
      bodyRecibido?.prospektia_api_key ||
      "RedApi_2026_SuperSegura_9XK2";

    const celularApiKey =
      Deno.env.get("CELULAR_API_KEY") ||
      bodyRecibido?.celular_api_key ||
      "mso_papi_2026_7f2b9c4d8e6a1b3f5d7c9e0a2b4c6d8f";

    // 4. Consultas concurrentes a las APIs externas
    const [leadsRes, rawNc, celularRes, ...pbxArrayDeArrays] =
      await Promise.all([
        fetchApiConDiagnostico(
          "leads",
          "https://prospektia.red.com.sv/api/external/leads-calificados",
          {
            method: "GET",
            headers: { "X-API-Key": prospektiaApiKey },
          }
        ),
        fetchTodosLeadsNoCalificados(prospektiaApiKey),
        fetchApiConDiagnostico(
          "llamadas_celular",
          "https://kpi.red.com.sv/api/historial-llamadas-ejecutivos",
          {
            method: "GET",
            headers: { "X-API-KEY": celularApiKey },
          }
        ),
        ...pbxRequests,
      ]);

    // 5. Mapeo, normalización y deduplicación estricta
    const rawLeads = extraerRegistros(leadsRes.data).map(normalizarLead);
    const dataLeads = deduplicarPorClave(rawLeads, "codigo_prospecto");

    const dataLeadsNoCalificados = deduplicarPorClave(
      await Promise.all(rawNc.map(normalizarLeadNoCalificado)),
      "id"
    );

    const dataCelular = deduplicarPorClave(
      extraerRegistros(celularRes.data),
      "id"
    );

    const dataLlamadasPbx = deduplicarPorClave(
      pbxArrayDeArrays.flat(),
      "uniqueid"
    );

    // 6. Upsert en Supabase sin conflictos de duplicados
    const resultados = await Promise.all([
      dataLeads.length > 0
        ? upsertEnLotes(supabase, "leads", dataLeads, "codigo_prospecto")
        : { tabla: "leads", insertados: 0, sinClave: 0, errores: [] },
      dataLeadsNoCalificados.length > 0
        ? upsertEnLotes(supabase, "leads_no_calificados", dataLeadsNoCalificados, "id")
        : { tabla: "leads_no_calificados", insertados: 0, sinClave: 0, errores: [] },
      dataCelular.length > 0
        ? upsertEnLotes(supabase, "llamadas_celular", dataCelular, "id")
        : { tabla: "llamadas_celular", insertados: 0, sinClave: 0, errores: [] },
      dataLlamadasPbx.length > 0
        ? upsertEnLotes(supabase, "llamadas_pbx", dataLlamadasPbx, "uniqueid")
        : { tabla: "llamadas_pbx", insertados: 0, sinClave: 0, errores: [] },
    ]);

    return new Response(
      JSON.stringify({
        status: "success",
        rango_sincronizado: {
          desde: fechaDesde,
          hasta: fechaHasta,
          paises: paisesASincronizar,
        },
        recibidos: {
          leads_total: rawLeads.length,
          leads_deduplicados: dataLeads.length,
          leads_no_calificados: dataLeadsNoCalificados.length,
          celular: dataCelular.length,
          pbx: dataLlamadasPbx.length,
        },
        resultados_persistencia: resultados,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ status: "error", message: err?.message || String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
