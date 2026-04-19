# Modelo de Asignaciones Documentales y Roles Internos

## Objetivo

Definir el modelo conceptual y relacional para representar:

- el `encargado` del documento
- las `personas asignadas`
- los `roles internos` sobre cada asignacion
- la trazabilidad de altas, bajas y cambios

## Decision principal

Para el MVP:

- el `encargado` no sera un campo separado en `documents`
- el `encargado` se modela como una asignacion documental con rol interno `encargado`
- las personas asignadas se modelan en la misma estructura base
- cada asignacion tendra un rol interno principal

Esta decision evita duplicar logica y deja el modelo listo para crecer sin romper el ownership de `workflow-service`.

## Regla del encargado unico

Reglas:

- cada documento debe tener un unico `encargado` activo
- el creador del documento queda como `encargado` inicial por defecto
- si cambia el encargado, la asignacion anterior deja de estar activa o deja de tener el rol `encargado`
- no puede existir mas de una asignacion activa con rol `encargado` para el mismo documento

Restriccion sugerida:

- unique parcial por `document_id` cuando `role_code = 'encargado'` y `is_active = true`

## Modelo de personas asignadas

La asignacion documental representa el vinculo operativo entre un `documento` y un `usuario`.

Una asignacion activa indica que la persona participa formalmente en el ciclo del documento.

Reglas:

- un documento puede tener muchas personas asignadas
- un usuario puede estar asignado a muchos documentos
- para el MVP, una persona solo puede tener una asignacion activa por documento
- si cambia su rol interno, se recomienda cerrar la asignacion anterior y crear una nueva para mantener trazabilidad limpia

Restriccion sugerida:

- unique parcial por `document_id` + `user_id` cuando `is_active = true`

## Roles internos

Catalogo sugerido:

- `encargado`
- `editor`
- `revisor`
- `aprobador`
- `participante`
- `lector`

Reglas:

- toda asignacion activa debe tener un rol interno principal
- revisores y aprobadores deben estar asignados al documento
- un cambio de rol debe quedar trazado
- para el MVP no se recomienda multiples roles activos sobre la misma asignacion

## Entidades recomendadas en workflow-service

### `document_assignment_roles`

Catalogo de roles internos.

Campos sugeridos:

- `id`
- `code`
- `name`
- `description`
- `is_system`
- `created_at`

## `document_assignments`

Tabla principal de asignaciones documentales.

Campos sugeridos:

- `id`
- `document_id`
- `user_id`
- `assignment_role_id`
- `assigned_by_user_id`
- `removed_by_user_id`
- `assigned_at`
- `removed_at`
- `removal_reason`
- `is_active`

Notas:

- `document_id` referencia logica al documento en `document-service`
- `user_id`, `assigned_by_user_id` y `removed_by_user_id` referencian logicamente a `auth-service`
- no debe haber `FK` cruzadas entre servicios

## Altas, bajas y cambios

### Alta

Cuando una persona se asigna a un documento:

- se crea una fila en `document_assignments`
- se registra quien la asigno
- se registra la fecha de alta
- queda `is_active = true`

### Baja

Cuando una persona se desasigna:

- no se elimina fisicamente la fila
- se marca `is_active = false`
- se registra `removed_at`
- se registra `removed_by_user_id`
- se registra `removal_reason`

### Cambio de rol

Para mantener historial claro en el MVP:

- se cierra la asignacion activa anterior
- se crea una nueva asignacion con el nuevo rol

### Cambio de encargado

Cuando cambia el encargado:

- se cierra la asignacion activa del encargado actual
- se crea una nueva asignacion activa con rol `encargado`
- el documento nunca debe quedar sin encargado activo

## Trazabilidad

La trazabilidad minima debe responder:

- quien asigno
- a quien asigno
- con que rol
- cuando se asigno
- quien desasigno
- cuando se desasigno
- por que se desasigno

Para el MVP, esta trazabilidad puede vivir en la misma tabla de asignaciones usando campos de auditoria y registros historicos por cierre y reapertura.

## Relacion entre asignaciones y permisos operativos

Regla de ownership:

- `workflow-service` define quien participa en el documento y con que rol operativo
- `collaboration-service` define los permisos documentales efectivos

Regla operativa:

- una asignacion puede disparar permisos por defecto segun el rol interno
- esos permisos se materializan en `collaboration-service`
- al desasignar a una persona, sus permisos derivados de la asignacion se revocan automaticamente
- si existe una excepcion manual de acceso, debe quedar administrada explicitamente en `collaboration-service`

Ejemplo:

- `encargado` puede recibir por defecto `view`, `comment`, `edit_metadata`, `upload_version`, `move_state`
- `revisor` puede recibir por defecto `view`, `comment`, `approve`
- `lector` puede recibir por defecto `view` y `download`

## Reglas para el DER de workflow-service

El DER de `workflow-service` debe salir de esta tarjeta con estas decisiones cerradas:

- `document_assignments` es la fuente de verdad de encargado y personas asignadas
- `document_assignment_roles` es el catalogo de roles internos
- el encargado se resuelve como una asignacion activa con rol `encargado`
- no se requieren joins con tablas de otros servicios
- la trazabilidad de altas, bajas y cambios queda resuelta con la propia tabla de asignaciones

## Criterio de cierre de la tarjeta

La tarjeta se considera cerrada cuando:

- existe un modelo claro de asignaciones documentales
- la regla del encargado unico ya esta resuelta
- los roles internos sobre asignaciones estan definidos
- la trazabilidad de altas y bajas queda definida
- la relacion entre asignaciones y permisos operativos queda clara
- el equipo puede pasar al DER de `workflow-service` sin ambiguedades
