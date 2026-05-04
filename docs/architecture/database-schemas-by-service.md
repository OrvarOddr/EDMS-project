# Bases o Schemas por Servicio

## Objetivo

Definir como se separara la persistencia de datos del sistema por microservicio usando una sola instancia de PostgreSQL durante el MVP.

## Decision principal

Para el MVP se usara:

- una sola instancia de `PostgreSQL`
- un `schema` por microservicio
- un usuario de base de datos por microservicio, sin usar el superusuario `postgres` en runtime
- migraciones independientes por servicio
- integracion entre servicios por HTTP interno, no por acceso directo a tablas

Esta decision permite avanzar rapido sin mezclar ownership de datos entre dominios.

## Schemas iniciales

Se proponen estos schemas:

- `auth`
- `documents`
- `workflow`
- `collaboration`
- `files`

## Mapeo servicio -> schema

- `auth-service` -> `auth`
- `document-service` -> `documents`
- `workflow-service` -> `workflow`
- `collaboration-service` -> `collaboration`
- `file-service` -> `files`

Nota:

- `api-gateway` no tiene schema propio
- `frontend` no tiene schema propio
- `MinIO` es infraestructura de storage, no un schema de PostgreSQL
- `postgres` solo se usa en el contenedor de inicializacion para crear roles y schemas

## Usuarios de base de datos en runtime

Cada servicio se conecta con un rol propio:

- `auth-service` -> `edms_auth`
- `document-service` -> `edms_documents`
- `workflow-service` -> `edms_workflow`
- `collaboration-service` -> `edms_collaboration`
- `file-service` -> `edms_files`

Reglas:

- cada rol solo recibe permisos sobre su schema
- las contrasenas viven en `.env` y no se versionan
- `infra/postgres/init-service-users.sh` crea o actualiza roles y schemas antes de arrancar los servicios
- si una variable de password falta o usa un placeholder debil, el arranque debe fallar

## Ownership por schema

### `auth`

Guarda:

- `users`
- `roles`
- `user_roles`
- `refresh_tokens`

No debe guardar:

- documentos
- estados documentales
- comentarios
- archivos

### `documents`

Guarda:

- `documents`
- `document_types`
- `document_versions`
- `expedients`

No debe guardar:

- asignaciones de personas
- estados del workflow
- comentarios
- archivos fisicos

### `workflow`

Guarda:

- `document_states`
- `state_transitions`
- `document_assignments`
- `assignment_roles`
- `state_history`

Reglas:

- el `encargado` se modela como una asignacion con rol especial
- cada documento tiene un unico encargado vigente
- las personas asignadas viven aqui como fuente de verdad

### `collaboration`

Guarda:

- `comments`
- `mentions`
- `document_permissions`
- `notifications`
- `activities`

No debe guardar:

- estado actual del documento
- asignaciones documentales como fuente de verdad

### `files`

Guarda:

- `stored_files`
- `file_uploads`

No debe guardar:

- metadata documental principal
- estados
- comentarios

## Reglas de diseno

- no existiran `FK` cruzadas entre schemas de distintos servicios
- no se haran joins entre datos de servicios distintos
- un microservicio no puede leer tablas de otro microservicio como dependencia normal de negocio
- toda integracion entre servicios se resuelve por API interna
- los IDs externos se guardan como referencias logicas, no como dependencias relacionales cruzadas

## Convencion sugerida

- cada tabla usa `uuid` como identificador primario
- cada servicio administra sus propias migraciones
- cada servicio inicializa su schema al arrancar migraciones
- los nombres de tablas quedan en plural y en ingles tecnico simple

Ejemplos:

- `auth.users`
- `documents.documents`
- `workflow.document_assignments`
- `collaboration.document_permissions`
- `files.stored_files`

## Estrategia de migraciones

Cada servicio debe tener:

- su propia carpeta de migraciones
- su propia configuracion de conexion
- su propio historial de cambios

Regla:

- `auth-service` migra solo `auth`
- `document-service` migra solo `documents`
- `workflow-service` migra solo `workflow`
- `collaboration-service` migra solo `collaboration`
- `file-service` migra solo `files`

## Decisiones congeladas del Bloque 2 relacionadas a persistencia

Estas decisiones no deberian reabrirse durante la implementacion salvo cambio de arquitectura explicitamente acordado:

- el MVP usa una sola instancia de `PostgreSQL`
- cada microservicio con persistencia propia usa un schema dedicado
- `api-gateway` y `frontend` no tienen persistencia relacional propia del dominio
- no existen llaves foraneas cruzadas entre schemas de servicios distintos
- las referencias entre servicios se hacen por IDs logicos
- las migraciones se ejecutan por servicio, no desde un modulo central compartido
- `workflow` es la fuente de verdad para encargado y personas asignadas
- el schema `workflow` debe existir desde el primer corte tecnico para materializar `Borrador` y `encargado` inicial
- `documents` no es fuente de verdad para asignaciones documentales
- `collaboration` no es fuente de verdad para asignaciones documentales
- `files` no es fuente de verdad para metadata documental principal

## Ventajas de esta decision

- mantiene ownership claro
- evita acoplamiento por base de datos
- simplifica el arranque local del MVP
- permite evolucionar luego a bases separadas si el proyecto lo necesita

## Riesgos a controlar

- duplicacion accidental de datos entre servicios
- intentar resolver consultas complejas leyendo tablas ajenas
- mezclar permisos con asignaciones en dos servicios distintos
- hacer del gateway un agregador con demasiada logica

## Criterio de cierre de la tarjeta

La tarjeta se considera cerrada cuando:

- el equipo acepta usar `schemas` por servicio en el MVP
- cada servicio tiene un espacio de persistencia definido
- queda prohibido el acceso directo a tablas de otro servicio
- la estrategia de migraciones independientes queda acordada

## Siguiente paso despues de esta tarjeta

Con esta tarjeta cerrada, el proyecto puede pasar a:

- `data/auth-service-der.md`
- `data/document-service-der.md`
- `data/file-service-der.md`
- `data/workflow-service-der.md`
- `data/collaboration-service-der.md`
