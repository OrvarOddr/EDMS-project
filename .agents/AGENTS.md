# Guía Operativa Para Agentes Codex

Este directorio define cómo debe trabajar Codex en este repositorio. La intención es que cualquier chat nuevo pueda continuar el proyecto con el mismo criterio: microservicios, historias de usuario, PRs a `develop`, validaciones y cuidado con cambios ajenos.

## Principios De Trabajo

- Trabajar siempre contra la documentación del repo antes de decidir: `docs/planning/MASTER-IMPLEMENTATION-CHECKLIST.md`, `docs/product/user-stories-backlog.md`, `docs/architecture/` y `docs/domain/`.
- El proyecto es de microservicios. No convertirlo a monolito ni mover ownership entre servicios por comodidad.
- No inventar reglas de negocio si ya están documentadas. Si falta una regla, dejarla explícita en el resumen y tomar la opción más conservadora.
- No tocar archivos no relacionados con la tarea. Si hay cambios ajenos o archivos no trackeados, ignorarlos salvo que bloqueen directamente.
- No agregar Jenkins. El pipeline objetivo es GitHub Actions.
- No agregar tests, dependencias, SQLite, mocks globales o infraestructura nueva si la tarea no lo pide.
- Mantener mensajes, commits y explicaciones en español.

## Ramas Y Git

- `main`: estable/producción.
- `develop`: integración.
- Trabajo diario desde `develop`.
- Convención de ramas:
  - `feature/us-XXX-nombre-corto` para nuevas historias.
  - `fix/us-XXX-nombre-corto` para correcciones.
  - `chore/nombre-corto` para mantenimiento.
- No usar ramas `codex/...`.
- No trabajar directo en `main`.
- Evitar trabajar directo en `develop` salvo integraciones puntuales o merges.
- Después de cada cambio terminado:
  1. verificar estado con `git status --short`;
  2. ejecutar validaciones razonables;
  3. stagear solo archivos relacionados;
  4. commit claro en español;
  5. push;
  6. abrir PR hacia `develop`;
  7. mergear si CI está verde y no hay conflictos.

## Validaciones Recomendadas

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend Python:

```bash
python3 -m compileall services/auth-service/app services/api-gateway/app services/document-service/app services/workflow-service/app services/collaboration-service/app services/file-service/app
```

Cuando exista un test explícito ya creado para el servicio:

```bash
cd services/document-service
PYTHONPATH=. pytest -q
```

No crear tests nuevos solo para satisfacer CI sin autorización. Si el CI falla por configuración, arreglar la configuración mínima y explicar.

## Arquitectura Del Proyecto

Servicios actuales:

- `frontend`: React + Vite + TypeScript.
- `services/api-gateway`: entrada del frontend, validación JWT, proxy.
- `services/auth-service`: usuarios, roles globales, login, refresh tokens.
- `services/document-service`: documentos, metadata, tags, versiones lógicas.
- `services/workflow-service`: estados, transiciones, encargado, asignaciones, historial workflow.
- `services/collaboration-service`: comentarios, menciones, notificaciones, actividad.
- `services/file-service`: upload/download, validación de archivos, MinIO, papelera.
- `infra/docker`: nginx y configuración de infraestructura.

Reglas de ownership:

- `workflow-service` es fuente de verdad para estado, encargado y asignaciones.
- `document-service` es fuente de verdad para metadata documental, documentos, tags y versiones lógicas.
- `file-service` es fuente de verdad para binarios, metadata de archivos y MinIO.
- `collaboration-service` es fuente de verdad para comentarios, menciones, actividad y notificaciones.
- Ningún servicio debe leer tablas de otro servicio.
- La integración entre servicios en el MVP es HTTP interno.

## Seguridad Base

- El gateway debe aceptar solo access tokens en rutas protegidas; nunca refresh tokens como Bearer normal.
- Validar `type=access`, `issuer` y `audience` cuando aplique.
- Usuarios inactivos, bloqueados o eliminados no deben operar endpoints protegidos.
- Endpoints internos que reciben IDs deben validar actor/permisos por headers internos o consultas al servicio dueño.
- No exponer secretos en commits, logs ni documentación.
- No persistir tokens en frontend si la sesión no se confirmó correctamente.
- Evitar endpoints que permitan consultar/alterar recursos ajenos por adivinar IDs.

## Frontend

- Mantener la estética oscura actual de Muninn, sin rediseños grandes si la tarea no lo pide.
- Para cambios en `DashboardPage.tsx`, tener especial cuidado: es un archivo grande con muchas responsabilidades.
- Si se agrega una acción de UI, debe:
  - actualizar estado local;
  - reflejarse en panel derecho/listas/kanban si aplica;
  - mostrar feedback con toast cuando corresponda;
  - respetar permisos y no dejar botones activos si no procede.
- Los filtros, búsqueda y dropdowns deben usar datos reales del backend cuando existan; no hardcodear nombres falsos.

## Backend

- Mantener routers simples y orientados al servicio dueño.
- Usar Pydantic para contratos.
- Usar SQLAlchemy según el patrón actual de cada servicio.
- Para permisos documentales, revisar primero `services/document-service/app/routers/versions.py`.
- Para estado y encargado, revisar `services/workflow-service/app/routers/documents.py`.
- Para archivos, revisar `services/file-service/app/routers/files.py`.
- Para comentarios/notificaciones, revisar `services/collaboration-service/app/routers/`.

## CI/CD

- CI vive en `.github/workflows/ci.yml`.
- CD vive en `.github/workflows/cd.yml` si existe.
- No modificar CI/CD salvo que la tarea lo pida o un fallo lo haga necesario.
- No agregar SQLite en CI si el servicio usa PostgreSQL y ya hay servicio `postgres` configurado.
- No asumir que todo push dispara CD: revisar los triggers del workflow.

## Comunicación Con El Usuario

- Ser directo y concreto.
- Si el usuario pregunta “qué hiciste”, responder con cambios funcionales, no con relleno.
- Si pregunta “cumple”, revisar contra checklist real y marcar qué está implementado, qué falta y qué no se puede afirmar.
- Si el usuario está molesto, no discutir el tono; corregir rápido y explicar breve.
- Evitar sobreexplicar cuando pidió acción.

## Archivos Locales A No Tocar Sin Permiso

- `.env`
- `.claude/`
- artefactos sueltos en `docs/` que no sean parte de la tarea
- archivos generados por LaTeX/PDF/PPTX si no se está trabajando documentación/presentación
- cambios ajenos visibles en `git status`
