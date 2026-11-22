-- ==============================================================================
-- DIAGNÓSTICO DE SHARED POOLER EGRESS, ÍNDICES Y AGREGACIONES SQL EN POSTGRESQL
-- Ejecutar en Supabase: SQL Editor -> Run
-- ==============================================================================

-- 1. DIAGNÓSTICO DE CONSULTAS CON MAYOR EGRESS EN EL SHARED POOLER (pg_stat_statements)
-- Identifica qué queries SQL directas (ORM / Pooler) devuelven más filas o leen más páginas.
SELECT
  calls AS ejecuciones,
  rows AS filas_totales_devueltas,
  ROUND(rows::numeric / GREATEST(calls, 1), 1) AS filas_promedio_por_consulta,
  ROUND(total_exec_time::numeric, 1) AS tiempo_total_ms,
  shared_blks_read + shared_blks_hit AS bloques_leidos,
  LEFT(query, 240) AS sql_resumen
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
  AND query NOT ILIKE '%information_schema%'
ORDER BY rows DESC, bloques_leidos DESC
LIMIT 20;

-- 2. PESO REAL POR TABLA (incluyendo TOAST para JSON/JSONB y textos largos)
SELECT
  relname AS tabla,
  n_live_tup AS filas_aproximadas,
  pg_size_pretty(pg_total_relation_size(relid)) AS tamano_total,
  pg_size_pretty(pg_relation_size(relid)) AS tamano_tabla,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid) - pg_indexes_size(relid)) AS tamano_toast_json_textos
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 3. ÍNDICES RECOMENDADOS PARA EVITAR SEQUENTIAL SCANS EN FILTROS POR FECHA
CREATE INDEX IF NOT EXISTS idx_llamadas_whatsapp_fecha_llamada
  ON public.llamadas_whatsapp (fecha_llamada DESC);

CREATE INDEX IF NOT EXISTS idx_llamadas_pbx_fecha_hora
  ON public.llamadas_pbx (fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_llamadas_pbx_fecha
  ON public.llamadas_pbx (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_llamadas_celular_fecha
  ON public.llamadas_celular (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_llamadas_teams_fecha_reunion
  ON public.llamadas_teams (fecha_reunion DESC);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON public.leads (created_at DESC);

-- 4. FUNCIÓN RPC DE AGREGACIÓN DIRECTA EN POSTGRESQL (COUNT / SUM / GROUP BY)
-- Devuelve el resumen de métricas en < 2 KB en lugar de descargar miles de filas.
CREATE OR REPLACE FUNCTION public.get_resumen_kpi_llamadas(
  p_desde timestamptz DEFAULT (now() - interval '30 days'),
  p_hasta timestamptz DEFAULT now()
)
RETURNS TABLE (
  canal text,
  total_llamadas bigint,
  contestadas bigint,
  duracion_total_segundos bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    'WhatsApp'::text AS canal,
    COUNT(*)::bigint AS total_llamadas,
    COUNT(*) FILTER (WHERE LOWER(COALESCE(estado, '')) = 'contestada' OR COALESCE(duracion_segundos, 0) > 0)::bigint AS contestadas,
    COALESCE(SUM(duracion_segundos), 0)::bigint AS duracion_total_segundos
  FROM public.llamadas_whatsapp
  WHERE fecha_llamada >= p_desde AND fecha_llamada <= p_hasta

  UNION ALL

  SELECT
    'Teams'::text AS canal,
    COUNT(*)::bigint AS total_llamadas,
    COUNT(*) FILTER (WHERE LOWER(COALESCE(estado_teams, '')) LIKE '%hizo%')::bigint AS contestadas,
    (COUNT(*) * 1800)::bigint AS duracion_total_segundos
  FROM public.llamadas_teams
  WHERE fecha_reunion::date >= p_desde::date AND fecha_reunion::date <= p_hasta::date;
$$;
