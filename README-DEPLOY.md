# Guía de Despliegue con Docker — KPI Métricas de Leads

## Qué hace el sistema
Plataforma web y servidor API (React + Vite + Express) para auditar el cumplimiento de tiempos de contacto sobre **Leads Calificados (citas)** y **Leads No Calificados**, cruzando llamadas multicanal (PBX, celular corporativo, WhatsApp y Teams) con semáforos de respuesta, comparativas por ejecutivo/período y exportación a Excel/PDF.

## Requisitos
- **Docker** (Engine 20.10+ o superior)
- **Docker Compose** v2 (`docker compose`)

## Puertos, Acceso y Health Check
- **Puerto expuesto:** `3000` (mapeado `3000:3000` en `docker-compose.yml`).
- **Acceso a la aplicación:** `http://localhost:3000` (o `http://<IP_DEL_SERVIDOR>:3000`).
- **Health Check:** `GET http://localhost:3000/api/health` (devuelve HTTP `200` con `{"ok": true, "status": "healthy"}`).
- **Volumen persistente:** `kpi_auditoria_data` montado en `/app/.data` (almacena estados KPI locales en `kpi-estados.json`).

## Comandos Docker Compose
Ejecutar desde la raíz del proyecto (`kpi_metricas_leads/`):

- **Construir y levantar en segundo plano:**
  ```bash
  docker compose up -d --build
  ```
- **Ver logs en vivo:**
  ```bash
  docker compose logs -f
  ```
- **Reiniciar el servicio:**
  ```bash
  docker compose restart
  ```
- **Detener y remover contenedores (conserva el volumen de datos):**
  ```bash
  docker compose down
  ```

## Nota de Configuración (Sin `.env`)
Este proyecto funciona tal cual está: las URLs, credenciales y claves de API ya están configuradas directamente dentro del código fuente (`server.ts` y `src/`). **No requiere crear archivo `.env` ni configurar variables de entorno externas** para levantarlo.

## Servicios Externos y Accesos de Red Requeridos
El contenedor necesita salida de red hacia los siguientes servicios:

| Servicio | URL / Endpoint | Protocolo y Puerto | Uso |
| :--- | :--- | :--- | :--- |
| **Supabase** | `https://sbopifiiyezmvsadwkpg.supabase.co` | HTTPS (`TCP 443`) | Catálogo de ejecutivos, Teams, WhatsApp y Edge Functions |
| **PBX / Audios** | `https://api.red.com.sv` | HTTPS (`TCP 443`) | Login JWT, registro de llamadas (`getCalls2`) y audios `.wav` |
| **Historial Celular** | `https://kpi.red.com.sv` | HTTPS (`TCP 443`) | Historial de llamadas de celulares corporativos |
| **ProspektIA** | `https://prospektia.red.com.sv` | HTTPS (`TCP 443`) | Sincronización de leads calificados y no calificados |
| **Issabel / Transcripciones QA** | `http://200.35.189.133:3000` | HTTP (`TCP 3000`) | Consulta de transcripciones y análisis QA de llamadas |
