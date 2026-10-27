import React, { useState } from 'react';
import {
  Info,
  Database,
  PhoneCall,
  Smartphone,
  MessageSquare,
  Zap,
  Users,
  BarChart3,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Shield,
  BookOpen,
  CalendarCheck,
  UserPlus,
  LogOut,
  User,
  RefreshCw,
} from 'lucide-react';
import { VistaApp, ModoLeads } from '../types';
import { getMesActualInfo } from '../utils/dateHelpers';

interface SidebarProps {
  vistaActiva: VistaApp;
  onCambiarVista: (vista: VistaApp) => void;
  modoLeads?: ModoLeads;
  onAlternarModoLeads?: () => void;
  conteos: {
    pbx: number;
    celular: number;
    whatsapp: number;
    leads: number;
    leadsNoCalificados: number;
    teams: number;
    catalogo: number;
  };
  onAbrirConfigSupabase?: () => void;
  usuario?: { nombre: string; rol: string } | null;
  onLogout?: () => void;
  onSincronizar?: () => void;
  sincronizando?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  vistaActiva,
  onCambiarVista,
  modoLeads = 'calificados',
  onAlternarModoLeads,
  conteos,
  onAbrirConfigSupabase,
  usuario,
  onLogout,
  onSincronizar,
  sincronizando = false,
}) => {
  const [menuRegistrosAbierto, setMenuRegistrosAbierto] = useState(true);
  const [menuResumenAbierto, setMenuResumenAbierto] = useState(true);
  const esCalificado = modoLeads !== 'no_calificados';

  return (
    <aside className="w-64 bg-[#0a0f1d] border-r border-slate-800 flex flex-col shrink-0 select-none min-h-screen">
      {/* Header Marca */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3 p-1.5 rounded-xl">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 w-10 rounded-full object-cover shadow-lg border border-slate-700/60 shadow-red-950/40"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white tracking-wide truncate">
              KPI AUDITORÍA
            </h1>
            <p className="text-[10px] font-medium truncate text-slate-400">
              Citas & Cumplimiento Multicanal
            </p>
          </div>
        </div>

        {/* Badge indicador de modo logueado */}
        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400">Modo:</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              esCalificado
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
            }`}
          >
            {esCalificado ? 'Leads Calificados' : 'Leads No Calificados'}
          </span>
        </div>
      </div>

      {/* Navegación Exacta de la imagen del usuario */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-sm font-medium">
        {/* 1. Criterios */}
        <button
          onClick={() => onCambiarVista('criterios')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
            vistaActiva === 'criterios'
              ? 'bg-rose-950/40 text-rose-300 font-semibold border-l-2 border-rose-500'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <Info className="h-4 w-4 shrink-0 text-slate-400" />
          <span>Criterios</span>
        </button>

        {/* 2. Registros (Desplegable) */}
        <div className="pt-2">
          <button
            onClick={() => setMenuRegistrosAbierto(!menuRegistrosAbierto)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Database className="h-4 w-4 text-slate-400" />
              <span>Registros</span>
            </div>
            {menuRegistrosAbierto ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {menuRegistrosAbierto && (
            <div className="ml-4 pl-2 border-l border-slate-800/80 space-y-1 mt-1">
              {/* Llamadas PBX */}
              <button
                onClick={() => onCambiarVista('reg_pbx')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                  vistaActiva === 'reg_pbx'
                    ? 'bg-red-950/60 text-red-200 font-semibold shadow-inner border-l-2 border-red-500'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <PhoneCall className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Llamadas PBX</span>
              </button>

              {/* Llamadas Celular */}
              <button
                onClick={() => onCambiarVista('reg_celular')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                  vistaActiva === 'reg_celular'
                    ? 'bg-blue-950/60 text-blue-200 font-semibold border-l-2 border-blue-500'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>Llamadas Celular</span>
              </button>

              {/* Llamadas WhatsApp */}
              <button
                onClick={() => onCambiarVista('reg_whatsapp')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                  vistaActiva === 'reg_whatsapp'
                    ? 'bg-emerald-950/60 text-emerald-200 font-semibold border-l-2 border-emerald-500'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Llamadas WhatsApp</span>
              </button>

              {/* 1. Leads Calificados (Solo si está logueado en modo calificados) */}
              {esCalificado && (
                <button
                  onClick={() => onCambiarVista('reg_leads')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                    vistaActiva === 'reg_leads'
                      ? 'bg-amber-950/60 text-amber-200 font-semibold border-l-2 border-amber-500'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                  title="Leads Calificados: Citas agendadas del mes actual"
                >
                  <CalendarCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-medium">Leads Calificados (Citas)</span>
                </button>
              )}

              {/* 2. Leads No Calificados (Solo si está logueado en modo no calificados) */}
              {!esCalificado && (
                <button
                  onClick={() => onCambiarVista('reg_leads_no_calificados')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                    vistaActiva === 'reg_leads_no_calificados'
                      ? 'bg-cyan-950/60 text-cyan-200 font-semibold border-l-2 border-cyan-500'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                  title="Leads No Calificados: Prospectos directos del mes actual"
                >
                  <UserPlus className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate font-medium">Leads No Calificados</span>
                </button>
              )}

              {/* Reuniones Teams */}
              <button
                onClick={() => onCambiarVista('reg_teams')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                  vistaActiva === 'reg_teams'
                    ? 'bg-purple-950/60 text-purple-200 font-semibold border-l-2 border-purple-500'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <Users className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span>Reuniones Teams</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. Catálogo (CRUD) */}
        <div className="pt-2">
          <button
            onClick={() => onCambiarVista('catalogo_crud')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
              vistaActiva === 'catalogo_crud'
                ? 'bg-indigo-950/50 text-indigo-300 font-semibold border-l-2 border-indigo-500'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
            <span>Catálogo (CRUD)</span>
          </button>
        </div>

        {/* 4. Resumen (Desplegable) */}
        <div className="pt-2">
          <button
            onClick={() => setMenuResumenAbierto(!menuResumenAbierto)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-200 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <span>Resumen</span>
            </div>
            {menuResumenAbierto ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {menuResumenAbierto && (
            <div className="ml-4 pl-2 border-l border-slate-800/80 space-y-1 mt-1">
              {/* Resumen KPIs */}
              <button
                onClick={() => onCambiarVista('resumen_kpis')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                  vistaActiva === 'resumen_kpis'
                    ? 'bg-rose-950/60 text-rose-200 font-semibold border-l-2 border-rose-500'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <span>Resumen KPIs</span>
              </button>

              {/* KPI 1: Cumplimiento Leads */}
              <button
                onClick={() => onCambiarVista('kpi_cumplimiento')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                  vistaActiva === 'kpi_cumplimiento'
                    ? 'bg-rose-950/60 text-rose-200 font-semibold border-l-2 border-rose-500'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-rose-400" />
                  <span>
                    KPI 1: Cumplimiento {esCalificado ? '' : '(1h / 9am)'}
                  </span>
                </div>
              </button>

              {/* KPI 2 y KPI 3 SOLO EXISTEN EN LEADS CALIFICADOS */}
              {esCalificado && (
                <>
                  {/* KPI 2: SLA de Etapas */}
                  <button
                    onClick={() => onCambiarVista('kpi_sla')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                      vistaActiva === 'kpi_sla'
                        ? 'bg-amber-950/60 text-amber-200 font-semibold border-l-2 border-amber-500'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-amber-400" />
                      <span>KPI 2: SLA de Etapas</span>
                    </div>
                  </button>

                  {/* KPI 3: Retroalimentación de Etapas */}
                  <button
                    onClick={() => onCambiarVista('kpi_retroalimentacion')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                      vistaActiva === 'kpi_retroalimentacion'
                        ? 'bg-emerald-950/60 text-emerald-200 font-semibold border-l-2 border-emerald-500'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>KPI 3: Retroalimentación</span>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer de Usuario y Salir (en vez de sincronización en caliente) */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 mt-auto space-y-2">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-red-950/70 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 font-bold text-xs shadow-inner">
              {usuario?.nombre ? usuario.nombre[0].toUpperCase() : 'G'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {usuario?.nombre || 'Gabi'}
              </div>
              <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"></span>
                <span>{usuario?.rol ? 'Auditor' : 'Conectado'}</span>
              </div>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 hover:text-white border border-rose-800/50 transition-all text-xs font-medium cursor-pointer shadow-sm shrink-0"
              title="Cerrar Sesión"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400" />
              <span>Salir</span>
            </button>
          )}
        </div>

        {/* Botón rápido de Sincronizar en vivo */}
        {onSincronizar && (
          <button
            onClick={onSincronizar}
            disabled={sincronizando}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-medium transition-all disabled:opacity-50 cursor-pointer"
            title="Refrescar y sincronizar datos en vivo"
          >
            <RefreshCw className={`h-3 w-3 ${sincronizando ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar Datos'}</span>
          </button>
        )}
      </div>
    </aside>
  );
};
