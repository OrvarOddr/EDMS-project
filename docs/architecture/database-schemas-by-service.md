# Bases o Schemas por Servicio

## Objetivo

Definir como se separara la persistencia de datos del sistema por microservicio usando una sola instancia de PostgreSQL durante el MVP.

## Decision principal

Para el MVP se usara:

- una sola instancia de `PostgreSQL`
- un `schema` por microservicio
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
