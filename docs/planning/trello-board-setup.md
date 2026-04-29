# Trello Board Setup

## 1. Listas del tablero

Crea estas listas:

- Backlog
- To Do
- In Progress
- Testing
- Done

## 2. Etiquetas sugeridas

Configura estas etiquetas:

- Frontend
- Backend
- Base de datos
- Seguridad
- UX
- DevOps
- P0
- P1
- P2

## 3. Formato recomendado del titulo de tarjeta

Usa este patron:

`[PRIORIDAD] [AREA] US-XXX Nombre corto`

Ejemplo:

`[P0] [Backend] US-009 Cargar archivo`

## 4. Descripcion recomendada para cada tarjeta

Pega esta estructura dentro de la tarjeta:

```md
Historia de usuario:
Como [tipo de usuario] quiero [objetivo] para [beneficio].

Criterios de aceptacion:
- ...
- ...
- ...

Notas tecnicas:
- Frontend:
- Backend:
- Base de datos:

Definicion de terminado:
- Implementado
- Probado
- Validado
```

## 5. Tarjetas para pegar en Backlog

Pega cada bloque en la lista `Backlog`. En Trello, cada linea se convertira en una tarjeta.

### Sprint 1

```text
[P0] [Seguridad] US-001 Iniciar sesion
[P0] [Seguridad] US-002 Cerrar sesion
[P0] [Backend] US-003 Crear usuario
[P0] [Backend] US-004 Asignar rol global
[P0] [Backend] US-008 Crear documento
[P0] [Backend] US-009 Cargar archivo
```

### Sprint 2

```text
[P0] [Seguridad] US-005 Dar permisos por documento
[P0] [Seguridad] US-006 Quitar permisos por documento
[P0] [Backend] US-010 Editar metadata
[P0] [Frontend] US-011 Ver detalle base de documento
[P0] [Backend] US-012 Subir nueva version
[P0] [Frontend] US-013 Ver tablero kanban
[P0] [Backend] US-014 Mover documento entre estados
[P0] [Backend] US-018 Asignar encargado de documento
[P0] [Backend] US-019 Gestionar personas asignadas del documento
[P0] [Frontend] US-020 Comentar documento
[P0] [Frontend] US-023 Buscar documentos
[P0] [Frontend] US-024 Filtrar documentos
[P0] [Backend] US-025 Ver historial de actividad
[P0] [Frontend] US-026 Ver historial de versiones
```

### Sprint 3

```text
[P0] [Backend] US-015 Observar documento
[P0] [Backend] US-016 Aprobar documento
[P1] [Backend] US-017 Rechazar documento
[P1] [Frontend] US-021 Mencionar usuario
[P1] [Frontend] US-027 Ver metricas principales
[P1] [Frontend] US-028 Ver actividad reciente
[P1] [Backend] US-031 Recibir notificacion por asignacion
[P1] [Backend] US-032 Recibir notificacion por comentario o mencion
```

### Sprint 4

```text
[P2] [Seguridad] US-007 Permisos con expiracion
[P2] [Frontend] US-022 Marcar comentario resuelto
[P1] [Backend] US-029 Crear expediente
[P1] [Frontend] US-030 Ver expediente
[P1] [Backend] US-033 Registrar fecha de vencimiento
[P1] [Frontend] US-034 Ver vencimientos proximos
```

## 6. Tarjetas tecnicas que conviene agregar

Estas no vienen de historias funcionales, pero te conviene crearlas igual:

```text
[P0] [Arquitectura] Definir modelo de dominio global y bounded contexts
[P0] [Arquitectura] Definir contratos y ownership entre microservicios
[P0] [Base de datos] Definir bases o schemas por servicio
[P0] [Base de datos] Diseñar modelo de asignaciones documentales y roles internos
[P0] [Backend] Configurar api-gateway base
[P0] [Backend] Configurar auth-service base
[P0] [Backend] Configurar document-service base
[P0] [Backend] Configurar file-service base
[P0] [Backend] Configurar workflow-service base
[P0] [Frontend] Configurar React + Vite + TypeScript base
[P0] [DevOps] Crear docker-compose con frontend gateway servicios postgres minio
[P0] [Backend] Integrar autenticacion JWT en auth-service
[P0] [Backend] Integrar MinIO en file-service
[P1] [Backend] Configurar workflow-service base
[P1] [Backend] Configurar collaboration-service base
[P1] [DevOps] Configurar lint y formateo
[P1] [Backend] Configurar migraciones por servicio
[P1] [Frontend] Crear layout base y navegacion
[P1] [DevOps] Configurar entorno local y variables
```

## 7. Como poblar rapido cada tarjeta

Para cada US:

1. Abre la historia correspondiente en `docs/product/user-stories-backlog.md`.
2. Copia la descripcion y criterios de aceptacion.
3. Pega eso dentro de la tarjeta.
4. Asigna etiqueta de prioridad y area.
5. Define persona a cargo y fecha.

Para tarjetas tecnicas y para usar el texto completo ya preparado:

6. Abre `docs/planning/trello-card-catalog.md`.
7. Copia la descripcion, checklist y definicion de terminado exactas.
8. Para reglas de ramas, commits y PRs, abre `docs/planning/team-git-workflow.md`.

## 8. Orden practico para arrancar

Si quieres iniciar el proyecto desde esta base, mueve estas tarjetas a `To Do`:

```text
[P0] [Arquitectura] Definir modelo de dominio global y bounded contexts
[P0] [Arquitectura] Definir contratos y ownership entre microservicios
[P0] [Base de datos] Definir bases o schemas por servicio
[P0] [Base de datos] Diseñar modelo de asignaciones documentales y roles internos
[P0] [Backend] Configurar api-gateway base
[P0] [Backend] Configurar auth-service base
[P0] [Backend] Configurar document-service base
[P0] [Backend] Configurar file-service base
[P0] [Frontend] Configurar React + Vite + TypeScript base
[P0] [DevOps] Crear docker-compose con frontend gateway servicios postgres minio
[P0] [Seguridad] US-001 Iniciar sesion
[P0] [Backend] US-008 Crear documento
[P0] [Backend] US-009 Cargar archivo
```

## 9. Orden maestro de trabajo

Nota:

- este orden maestro es la secuencia recomendada a nivel de arquitectura
- si el tablero ya fue creado siguiendo la numeracion de `docs/planning/trello-card-catalog.md`, se puede continuar con esa secuencia sin renumerar tarjetas
- en ese caso, despues de `Diseñar DER de document-service` puede venir `Configurar api-gateway base`
- los DER de `workflow-service`, `collaboration-service` y `file-service` siguen siendo necesarios, pero no bloquean el arranque inicial de `api-gateway`, `auth-service`, `document-service` y `file-service` base
- antes de cerrar el primer corte tecnico, el DER de `workflow-service` debe estar cerrado porque `workflow-service` minimo entra en ese corte
- antes de implementar en serio `collaboration-service`, su DER debe quedar cerrado

### Fase 1 - Dominio y arquitectura

```text
[P0] [Arquitectura] Definir modelo de dominio global y bounded contexts
[P0] [Arquitectura] Definir contratos y ownership entre microservicios
[P0] [Base de datos] Definir bases o schemas por servicio
[P0] [Base de datos] Diseñar modelo de asignaciones documentales y roles internos
[P0] [Base de datos] Diseñar DER de auth-service
[P0] [Base de datos] Diseñar DER de document-service
[P1] [Base de datos] Diseñar DER de workflow-service
[P1] [Base de datos] Diseñar DER de collaboration-service
[P1] [Base de datos] Diseñar DER de file-service
```

### Fase 2 - Fundacion tecnica local

```text
[P0] [Backend] Configurar api-gateway base
[P0] [Backend] Configurar auth-service base
[P0] [Backend] Configurar document-service base
[P0] [Backend] Configurar file-service base
[P0] [Backend] Configurar workflow-service base
[P0] [Frontend] Configurar React + Vite + TypeScript base
[P0] [DevOps] Definir entorno local y entorno Azure del MVP
[P0] [DevOps] Configurar docker-compose con frontend gateway servicios postgres minio
[P1] [Backend] Configurar migraciones por servicio
[P1] [DevOps] Configurar entorno local y variables
[P1] [DevOps] Configurar lint y formateo
[P1] [Frontend] Crear layout base y navegacion
```

### Fase 3 - Primer corte funcional

```text
[P0] [Seguridad] US-001 Iniciar sesion
[P0] [Seguridad] US-002 Cerrar sesion
[P0] [Backend] US-003 Crear usuario
[P0] [Backend] US-004 Asignar rol global
[P0] [Backend] US-008 Crear documento
[P0] [Backend] US-009 Cargar archivo
[P0] [Frontend] US-011 Ver detalle base de documento
[P0] [Frontend] US-023 Buscar documentos
```

### Fase 4 - Workflow documental

```text
[P1] [Backend] Configurar workflow-service base
[P0] [Frontend] US-013 Ver tablero kanban
[P0] [Backend] US-014 Mover documento entre estados
[P0] [Backend] US-018 Asignar encargado de documento
[P0] [Backend] US-019 Gestionar personas asignadas del documento
[P0] [Backend] US-015 Observar documento
[P0] [Backend] US-016 Aprobar documento
[P1] [Backend] US-017 Rechazar documento
```

### Fase 5 - Colaboracion y permisos

```text
[P1] [Backend] Configurar collaboration-service base
[P0] [Seguridad] US-005 Dar permisos por documento
[P0] [Seguridad] US-006 Quitar permisos por documento
[P0] [Frontend] US-020 Comentar documento
[P1] [Frontend] US-021 Mencionar usuario
[P0] [Backend] US-025 Ver historial de actividad
[P0] [Frontend] US-026 Ver historial de versiones
[P1] [Backend] US-031 Recibir notificacion por asignacion
[P1] [Backend] US-032 Recibir notificacion por comentario o mencion
[P2] [Frontend] US-022 Marcar comentario resuelto
[P2] [Seguridad] US-007 Permisos con expiracion
```

### Fase 6 - Ampliacion documental

```text
[P0] [Backend] US-010 Editar metadata
[P0] [Backend] US-012 Subir nueva version
[P0] [Frontend] US-024 Filtrar documentos
[P1] [Backend] US-029 Crear expediente
[P1] [Frontend] US-030 Ver expediente
[P1] [Backend] US-033 Registrar fecha de vencimiento
[P1] [Frontend] US-034 Ver vencimientos proximos
[P1] [Frontend] US-027 Ver metricas principales
[P1] [Frontend] US-028 Ver actividad reciente
```

### Fase 7 - Azure y despliegue

```text
[P0] [DevOps] Diseñar estrategia de storage: MinIO local + Blob Storage Azure
[P0] [DevOps] Configurar Azure Container Registry
[P0] [DevOps] Configurar Azure Database for PostgreSQL Flexible Server
[P0] [DevOps] Configurar Azure Blob Storage
[P1] [Seguridad] Configurar Azure Key Vault
[P1] [Seguridad] Configurar Managed Identity para servicios
[P1] [DevOps] Configurar observabilidad con Azure Monitor y Log Analytics
[P1] [DevOps] Definir despliegue a Azure con IaC
[P1] [DevOps] Adaptar pipeline de CI/CD para build push deploy en Azure
```

## 10. Regla operativa para mover tarjetas

- `Backlog`: todo lo no iniciado
- `To Do`: maximo 3 tarjetas de la fase actual
- `In Progress`: maximo 1 tarjeta de arquitectura o backend por persona
- `Testing`: solo cuando ya existe algo ejecutable o verificable
- `Done`: solo cuando cumple su definicion de terminado
