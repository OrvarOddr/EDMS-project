# Modelo de Dominio Global y Bounded Contexts

## Objetivo

Definir el mapa global del negocio y separar el sistema en contextos bien delimitados para evitar mezclar responsabilidades entre microservicios.

## Regla base del negocio

- Cada documento tiene un unico `encargado` vigente.
- Cada documento puede tener multiples `personas asignadas`.
- Cada persona asignada puede tener un `rol interno` sobre el documento.

## Bounded contexts iniciales

### 1. Auth

Responsabilidad:

- identidad
- autenticacion
- autorizacion global

Entidades:

- `User`
- `Role`
- `RefreshToken`

No debe manejar:

- documentos
- estados documentales
- comentarios
- archivos

### 2. Documents

Responsabilidad:

- documento
- metadata
- versiones logicas
- tipos documentales
- expedientes

Entidades:

- `Document`
- `DocumentVersion`
- `DocumentType`
- `Expedient`

No debe manejar:

- encargado del documento
- personas asignadas
- comentarios
- permisos
- archivos fisicos

### 3. Workflow

Responsabilidad:

- estado del documento
- transiciones
- encargado
- personas asignadas
- roles internos de asignacion
- historial de estado

Entidades:

- `DocumentState`
- `StateTransition`
- `DocumentAssignment`
- `AssignmentRole`
- `StateHistory`

No debe manejar:

- contenido del documento
- comentarios
- almacenamiento fisico

### 4. Collaboration

Responsabilidad:

- comentarios
- menciones
- permisos por documento
- notificaciones
- actividad

Entidades:

- `Comment`
- `Mention`
- `DocumentPermission`
- `Notification`
- `Activity`

No debe manejar:

- metadata del documento
- versionado logico
- almacenamiento fisico

### 5. Files

Responsabilidad:

- upload
- download
- validacion de archivo
- referencia fisica en storage

Entidades:

- `StoredFile`
- `FileUpload`

No debe manejar:

- estado documental
- comentarios
- permisos operativos

## Relaciones conceptuales entre contextos

- `Auth.User` participa en todos los demas contextos por referencia de `user_id`.
- `Documents.Document` es la entidad central del negocio.
- `Workflow` se relaciona con `Documents.Document` por `document_id`.
- `Collaboration` se relaciona con `Documents.Document` por `document_id`.
- `Files` se relaciona con `Documents.DocumentVersion` por referencia logica a archivo almacenado.

## Distinciones clave del dominio

Estas definiciones deben mantenerse estables en todo el proyecto:

- `propietario documental`: define la referencia responsable o titular del documento a nivel metadata y pertenece a `Documents`
- `rol global`: define capacidades generales del usuario en el sistema y pertenece a `Auth`
- `asignacion documental`: define participacion operativa de un usuario sobre un documento y pertenece a `Workflow`
- `rol interno`: define la funcion operativa de una asignacion documental y pertenece a `Workflow`
- `permiso documental`: define grants especificos de colaboracion sobre un documento y pertenece a `Collaboration`

Reglas:

- el propietario documental no reemplaza al encargado operativo
- una asignacion documental no implica por si sola todos los permisos documentales finales
- un permiso documental no convierte a un usuario en participante operativo del documento
- un rol interno no reemplaza un rol global
- el permiso efectivo final puede resultar de la combinacion entre rol global, asignacion y grants documentales

## Ownership inicial

- `auth-service` es duenio de usuarios y roles.
- `document-service` es duenio del documento y su metadata.
- `workflow-service` es duenio de encargado, personas asignadas y estados.
- `collaboration-service` es duenio de comentarios, permisos y actividad.
- `file-service` es duenio del almacenamiento fisico y sus referencias.

## Decisiones cerradas

- No existira un microservicio de “equipos”.
- Las personas se asignan directamente a un documento.
- `workflow-service` sera el duenio de las asignaciones documentales.
- `document-service` no guardara personas asignadas como fuente de verdad.

## Decisiones cerradas en esta tarjeta

### 1. Encargado inicial del documento

Decision:

- el creador del documento queda como `encargado` inicial por defecto

Motivo:

- evita documentos sin dueno operativo
- simplifica el flujo inicial del MVP
- reduce pasos manuales al crear un documento

### 2. Modelado del encargado

Decision:

- el encargado se modela como una `asignacion documental` con un rol interno especial `encargado`

Motivo:

- evita duplicar logica entre encargado y personas asignadas
- permite tratar todas las asignaciones con una sola estructura
- simplifica auditoria, altas, bajas y reasignaciones

### 3. Revisores y aprobadores

Decision:

- revisores y aprobadores deben estar asignados al documento

Motivo:

- mantiene trazabilidad consistente
- evita aprobaciones de usuarios fuera del flujo operativo
- simplifica permisos y reglas del MVP

### 4. Desasignacion y permisos

Decision:

- al quitar una persona asignada, sus permisos documentales asociados se revocan automaticamente salvo excepcion administrada manualmente

Motivo:

- evita accesos residuales
- mantiene coherencia entre asignacion y acceso
- reduce riesgo operativo y de seguridad

## Modelo conceptual recomendado

### Reglas operativas

- un documento siempre tiene al menos una asignacion activa con rol `encargado`
- una persona no puede tener dos asignaciones activas iguales sobre el mismo documento
- una persona puede tener mas de un rol interno sobre el documento solo si el negocio lo justifica; para el MVP se recomienda un rol interno principal por asignacion
- si cambia el encargado, la asignacion anterior deja de tener rol `encargado`

### Estructura conceptual

- `Document`
- `User`
- `DocumentAssignment`
- `AssignmentRole`

Relacion esperada:

- `DocumentAssignment` conecta `Document` con `User`
- `AssignmentRole` define el rol operativo de esa asignacion
- el rol `encargado` identifica al dueno operativo vigente del documento

## Criterio de cierre de la tarjeta

La tarjeta se considera cerrada cuando el equipo acepta estas decisiones y las usa como base para:

- `Definir contratos y ownership entre microservicios`
- `Diseñar modelo de asignaciones documentales y roles internos`
- `Diseñar DER de workflow-service`

## Salida esperada de esta tarjeta

- lista cerrada de bounded contexts
- lista de entidades por contexto
- relaciones conceptuales entre contextos
- ownership inicial por microservicio
- decisiones base del dominio ya cerradas

## Estado de cierre

La tarjeta se considera cerrada y utilizable como base del proyecto cuando el equipo acepta que:

- estas entidades son las entidades oficiales del dominio
- estos bounded contexts son los contexts oficiales del sistema
- las reglas de encargado, personas asignadas y revisores quedan cerradas
- las distinciones entre rol global, asignacion, rol interno y permiso documental quedan cerradas

## Fuera del alcance de esta tarjeta

Esta tarjeta no decide todavia:

- endpoints ni contratos HTTP
- schemas o migraciones
- DER fisico por microservicio
- orden exacto del scaffolding tecnico

Esas decisiones pertenecen a los bloques siguientes.
