-- ==============================================================================
-- SCRIPT DE INSPECCIÓN Y PERMISOS: AUDITORÍA DE CITAS Y LLAMADAS
-- Ejecuta este script en Supabase: SQL Editor -> Run
-- ==============================================================================

-- 1. CONSULTA DE INSPECCIÓN:
-- Ejecuta esto primero si solo deseas ver qué tablas y columnas tienes actualmente en tu Supabase:
SELECT 
    table_name, 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND (
    table_name ILIKE '%lead%' 
    OR table_name ILIKE '%llamada%' 
    OR table_name ILIKE '%call%' 
    OR table_name ILIKE '%pbx%' 
    OR table_name ILIKE '%celular%' 
    OR table_name ILIKE '%what%' 
    OR table_name ILIKE '%team%' 
    OR table_name ILIKE '%catalog%' 
    OR table_name ILIKE '%asesor%' 
    OR table_name ILIKE '%ejecutiv%'
  )
ORDER BY table_name, ordinal_position;


-- ==============================================================================
-- 2. HABILITAR PERMISOS DE LECTURA (SELECT) AL ROL ANON:
-- Para que el dashboard pueda leer tus tablas con tu supabase_url y supabase_anon_key:
-- (Aplica a todas las tablas existentes de telefonía, mensajería y leads)
-- ==============================================================================

DO $$
DECLARE
    tbl text;
    tablas_candidatas text[] := ARRAY[
        'leads',
        'leads_calificados',
        'leads_no_calificados',
        'llamadas_pbx',
        'llamadas_celular',
        'llamadas_whatsapp',
        'mensajes_whatsapp',
        'reuniones_teams',
        'llamadas_teams',
        'catalogo_asesores',
        'catalogo_vendedores',
        'catalogo_usuarios',
        'extensiones_asesores'
    ];
BEGIN
    FOR i IN 1..array_length(tablas_candidatas, 1) LOOP
        tbl := tablas_candidatas[i];
        
        -- Verificar si la tabla existe antes de aplicar RLS y políticas
        IF EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- Habilitar RLS si no está habilitado
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            
            -- Eliminar política anterior si existía para evitar duplicados
            EXECUTE format('DROP POLICY IF EXISTS "Permitir_Lectura_Dashboard_%s" ON public.%I;', tbl, tbl);
            
            -- Crear política de lectura pública para anon y authenticated
            EXECUTE format(
                'CREATE POLICY "Permitir_Lectura_Dashboard_%s" ON public.%I FOR SELECT TO anon, authenticated USING (true);', 
                tbl, tbl
            );
            
            -- Conceder permisos de lectura al rol anon
            EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', tbl);
            
            RAISE NOTICE 'Permisos de lectura aplicados a tabla: %', tbl;
        END IF;
    END LOOP;
END $$;


-- ==============================================================================
-- 3. VISTA RESUMEN RÁPIDA: CONTEO DE REGISTROS POR TABLA
-- Para verificar cuántos registros tiene cada tabla en tu base de datos:
-- ==============================================================================
SELECT 
    schemaname, 
    relname AS nombre_tabla, 
    n_live_tup AS cantidad_aproximada_filas
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
