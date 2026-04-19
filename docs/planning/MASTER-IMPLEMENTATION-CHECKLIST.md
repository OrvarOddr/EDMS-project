# Checklist Maestro de Implementacion

Este documento ordena el proyecto completo de punta a punta usando como base:

- `docs/foundation/PROJECT-FOUNDATION.md`
- `docs/product/product-blueprint.md`
- `docs/domain/domain-model-and-bounded-contexts.md`
- `docs/architecture/contracts-and-service-ownership.md`
- `docs/architecture/database-schemas-by-service.md`
- `docs/product/user-stories-backlog.md`
- `docs/planning/trello-card-catalog.md`

La idea es usar este checklist como secuencia oficial de construccion del proyecto reiniciado.

## Fase 0. Base del repositorio

- [ ] Inicializar el repositorio Git local
- [ ] Conectar el repositorio local con GitHub
- [ ] Dejar `main` como rama principal
- [ ] Crear rama `develop`
- [ ] Subir la base documental al remoto nuevo
- [ ] Confirmar que `README.md`, `.gitignore` y `.env.example` quedaron alineados con el reinicio

## Fase 1. Cierre documental obligatorio

### Bloque 1. Dominio

- [ ] Cerrar `foundation/PROJECT-FOUNDATION.md`
- [ ] Cerrar `domain/domain-model-and-bounded-contexts.md`
- [ ] Cerrar `domain/document-assignments-and-internal-roles-model.md`
- [ ] Confirmar bounded contexts oficiales
- [ ] Confirmar entidades oficiales por contexto
- [ ] Confirmar reglas base del negocio
- [ ] Confirmar distincion entre rol global, propietario documental, asignacion, rol interno y permiso documental
- [ ] Confirmar modelo conceptual de `encargado` y personas asignadas

### Bloque 2. Ownership y contratos

- [ ] Cerrar `architecture/contracts-and-service-ownership.md`
- [ ] Confirmar ownership funcional por microservicio
- [ ] Confirmar ownership unico por entidad
- [ ] Confirmar fronteras entre `Documents`, `Workflow`, `Collaboration` y `Files`
- [ ] Confirmar integracion entre servicios via HTTP interno
- [ ] Confirmar que ningun servicio lee tablas de otro
- [ ] Confirmar que `api-gateway` no implementa logica de negocio

### Bloque 3. Persistencia

- [ ] Cerrar `architecture/database-schemas-by-service.md`
- [ ] Confirmar una sola instancia de PostgreSQL para el MVP
- [ ] Confirmar un `schema` por microservicio
- [ ] Confirmar que `workflow` es fuente de verdad para encargado y personas asignadas
- [ ] Confirmar que `documents` no es fuente de verdad para asignaciones
- [ ] Confirmar que `collaboration` no es fuente de verdad para asignaciones
- [ ] Confirmar que no existiran FK cruzadas entre servicios
- [ ] Confirmar que las referencias entre servicios seran por IDs logicos
- [ ] Confirmar estrategia de migraciones independientes por servicio

### Bloque 4. Modelo relacional por servicio

- [ ] Cerrar `data/auth-service-der.md`
- [ ] Cerrar `data/document-service-der.md`
- [ ] Cerrar `data/file-service-der.md`
- [ ] Cerrar `data/workflow-service-der.md`
- [ ] Cerrar `data/collaboration-service-der.md`
- [ ] Confirmar PK, indices, unicidad y restricciones por servicio
- [ ] Confirmar trazabilidad minima por entidad
- [ ] Confirmar timestamps y estrategia de soft delete donde aplique

## Fase 2. Preparacion funcional del MVP

- [ ] Revisar `product/user-stories-backlog.md`
- [ ] Confirmar historias del primer corte tecnico
- [ ] Confirmar historias que quedan fuera del primer corte
- [ ] Confirmar dependencias entre historias
- [ ] Confirmar orden de implementacion entre backend, frontend e infraestructura

### Historias minimas del primer corte tecnico

- [ ] US-001 Iniciar sesion
- [ ] US-002 Cerrar sesion
- [ ] US-003 Crear usuario
- [ ] US-004 Asignar rol global
- [ ] US-008 Crear documento
- [ ] US-009 Cargar archivo
- [ ] US-011 Ver detalle base de documento

### Slice minima adicional obligatoria del MVP

- [ ] Materializar estado inicial `Borrador` en `workflow-service`
- [ ] Materializar `encargado` inicial igual al creador del documento
- [ ] Confirmar contrato entre `document-service` y `workflow-service` para bootstrap del documento

## Fase 3. Estructura tecnica del repositorio

- [ ] Crear `frontend/`
- [ ] Crear `services/`
- [ ] Crear `services/api-gateway/`
- [ ] Crear `services/auth-service/`
- [ ] Crear `services/document-service/`
- [ ] Crear `services/workflow-service/`
- [ ] Crear `services/collaboration-service/`
- [ ] Crear `services/file-service/`
- [ ] Crear `infra/docker/`
- [ ] Confirmar estructura del repo alineada con `architecture/microservices-architecture.md`

## Fase 4. Scaffold tecnico base

### Servicios y frontend base

- [ ] Configurar `api-gateway` base
- [ ] Configurar `auth-service` base
- [ ] Configurar `document-service` base
- [ ] Configurar `file-service` base
- [ ] Configurar `workflow-service` base
- [ ] Configurar `collaboration-service` base
- [ ] Configurar `frontend` base con React + Vite + TypeScript

### Checklist minimo comun por servicio

- [ ] Crear proyecto base
- [ ] Crear estructura minima del servicio
- [ ] Configurar variables de entorno
- [ ] Configurar endpoint `health`
- [ ] Configurar router base
- [ ] Configurar capa de config
- [ ] Configurar persistencia si corresponde
- [ ] Configurar estructura de modulos interna
- [ ] Verificar arranque local

## Fase 5. Infraestructura local

- [ ] Crear `docker-compose.yml`
- [ ] Agregar `postgres`
- [ ] Agregar `minio`
- [ ] Agregar `frontend`
- [ ] Agregar `api-gateway`
- [ ] Agregar `auth-service`
- [ ] Agregar `document-service`
- [ ] Agregar `workflow-service`
- [ ] Agregar `collaboration-service`
- [ ] Agregar `file-service`
- [ ] Configurar volúmenes necesarios
- [ ] Configurar variables de entorno del entorno local
- [ ] Configurar `nginx` base
- [ ] Confirmar que el entorno local levanta completo

## Fase 6. Pipeline inicial

- [ ] Crear workflow base de GitHub Actions
- [ ] Agregar checkout del repositorio
- [ ] Agregar validacion basica del repo
- [ ] Agregar escaneo de secretos con `gitleaks`
- [ ] Agregar validacion de Dockerfiles con `hadolint` cuando existan
- [ ] Agregar lint/format del frontend cuando exista
- [ ] Agregar lint/format del backend cuando exista
- [ ] Confirmar que el pipeline corre en `push` y `pull_request`

## Fase 7. Primer corte tecnico del MVP

### Seguridad y acceso

- [ ] US-001 Iniciar sesion
- [ ] US-002 Cerrar sesion
- [ ] US-003 Crear usuario
- [ ] US-004 Asignar rol global

### Gestion documental minima

- [ ] US-008 Crear documento
- [ ] US-009 Cargar archivo
- [ ] US-011 Ver detalle base de documento

### Workflow minimo obligatorio

- [ ] Crear estado inicial `Borrador`
- [ ] Crear `encargado` inicial por defecto
- [ ] Garantizar que `workflow-service` quede como fuente de verdad de estado y asignaciones

### Resultado esperado del primer corte

- [ ] El usuario puede iniciar sesion
- [ ] El admin puede crear usuarios
- [ ] El sistema puede crear documentos
- [ ] El sistema puede almacenar archivos en MinIO
- [ ] El sistema puede listar y abrir detalle base de documento
- [ ] El documento nace con `Borrador`
- [ ] El creador queda como `encargado` inicial

## Fase 8. Gestion documental ampliada

- [ ] US-010 Editar metadata
- [ ] US-012 Subir nueva version
- [ ] US-026 Ver historial de versiones

## Fase 9. Workflow operativo

- [ ] US-018 Asignar encargado de documento
- [ ] US-019 Gestionar personas asignadas del documento
- [ ] US-013 Ver tablero kanban
- [ ] US-014 Mover documento entre estados
- [ ] US-015 Observar documento
- [ ] US-016 Aprobar documento
- [ ] US-017 Rechazar documento

## Fase 10. Collaboration

- [ ] US-005 Dar permisos por documento
- [ ] US-006 Quitar permisos por documento
- [ ] US-020 Comentar documento
- [ ] US-021 Mencionar usuario
- [ ] US-022 Marcar comentario resuelto
- [ ] US-025 Ver historial de actividad

## Fase 11. Busqueda, filtros y expedientes

- [ ] US-023 Buscar documentos
- [ ] US-024 Filtrar documentos
- [ ] US-029 Crear expediente
- [ ] US-030 Ver expediente

## Fase 12. Dashboard y notificaciones

- [ ] US-027 Ver metricas principales
- [ ] US-028 Ver actividad reciente
- [ ] US-031 Recibir notificacion por asignacion
- [ ] US-032 Recibir notificacion por comentario o mencion

## Fase 13. Vencimientos y control

- [ ] US-033 Registrar fecha de vencimiento
- [ ] US-034 Ver vencimientos proximos
- [ ] US-007 Permisos con expiracion

## Fase 14. Calidad y pipeline completo

- [ ] Extender el pipeline base a pipeline completo
- [ ] Agregar lint frontend
- [ ] Agregar format check frontend
- [ ] Agregar tests frontend
- [ ] Agregar lint backend
- [ ] Agregar format check backend
- [ ] Agregar tests backend
- [ ] Agregar build de frontend
- [ ] Agregar build de imagenes Docker
- [ ] Agregar validacion de Dockerfiles
- [ ] Agregar escaneo de secretos
- [ ] Agregar escaneo basico de seguridad del repo o de imagenes

## Fase 15. DevOps y despliegue

- [ ] Configurar migraciones Alembic por servicio
- [ ] Confirmar estrategia de `.env` por servicio
- [ ] Confirmar estrategia de secretos para servidor
- [ ] Definir estrategia de despliegue para `develop`
- [ ] Definir estrategia de despliegue para `main`
- [ ] Configurar GitHub Actions para deploy
- [ ] Configurar runner o estrategia SSH para despliegue
- [ ] Configurar compose de servidor
- [ ] Configurar `nginx` de servidor
- [ ] Configurar backups de PostgreSQL
- [ ] Configurar persistencia y backup de MinIO
- [ ] Configurar estrategia de logs

## Fase 16. Monitoreo y endurecimiento

- [ ] Configurar Prometheus
- [ ] Configurar Grafana
- [ ] Definir metricas base por servicio
- [ ] Definir alarmas o chequeos minimos
- [ ] Revisar seguridad de JWT y credenciales
- [ ] Revisar endurecimiento de contenedores

## Huecos que deben existir como tarjetas tecnicas explicitas

- [ ] Diseñar DER de `file-service`
- [ ] Diseñar DER de `workflow-service`
- [ ] Diseñar DER de `collaboration-service`
- [ ] Configurar `workflow-service` base
- [ ] Configurar `collaboration-service` base
- [ ] Crear pipeline base de GitHub Actions
- [ ] Extender pipeline a version completa
- [ ] Configurar migraciones Alembic por servicio
- [ ] Configurar `nginx` base y de servidor
- [ ] Configurar despliegue automatico
- [ ] Configurar monitoreo y backups

## Criterio de proyecto listo

El proyecto puede considerarse realmente encaminado cuando:

- [ ] la fase documental obligatoria esta cerrada
- [ ] el scaffold tecnico existe para todos los servicios
- [ ] el entorno local levanta completo
- [ ] el pipeline inicial corre automaticamente
- [ ] el primer corte tecnico del MVP funciona de punta a punta
- [ ] existe una ruta clara para workflow, collaboration, dashboard, notificaciones y despliegue
