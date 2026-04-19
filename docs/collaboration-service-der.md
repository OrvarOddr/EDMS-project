# DER de collaboration-service

## Objetivo

Diseñar el modelo entidad-relacion del servicio de colaboracion para soportar:

- comentarios sobre documentos
- menciones de usuarios en comentarios
- permisos documentales efectivos por usuario
- notificaciones internas
- registro de actividad y auditoria

## Scope del servicio

`collaboration-service` es duenio de:

- comentarios y menciones
- permisos efectivos por documento y usuario
- notificaciones internas del sistema
- actividad auditable de todas las acciones relevantes

No debe guardar:

- metadata documental
- estado del documento
- asignaciones operativas
- archivos fisicos
- credenciales ni roles globales

## Entidades del DER

### 1. `comments`

Comentarios sobre un documento o una version especifica.

Campos sugeridos:

- `id` uuid pk
- `document_id` uuid not null
- `document_version_id` uuid null
- `author_user_id` uuid not null
- `body` text not null
- `is_resolved` boolean not null default false
- `resolved_by_user_id` uuid null
- `resolved_at` timestamptz null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Restricciones:

- `document_id` obligatorio
- `body` no nulo ni vacio
- `document_version_id` opcional, solo si el comentario aplica a una version especifica

Notas:

- `document_id` y `document_version_id` son referencias logicas a `document-service`
- `author_user_id` y `resolved_by_user_id` son referencias logicas a `auth-service`

### 2. `mentions`

Menciones de usuarios dentro de un comentario.

Campos sugeridos:

- `id` uuid pk
- `comment_id` uuid not null
- `mentioned_user_id` uuid not null
- `created_at` timestamptz not null

Restricciones:

- unique por `comment_id` + `mentioned_user_id`
- `comment_id` obligatorio

Notas:

- `mentioned_user_id` referencia logica a `auth-service`
- una mencion genera automaticamente una notificacion para el usuario mencionado

### 3. `document_permissions`

Permisos efectivos por usuario sobre un documento especifico.

Campos sugeridos:

- `id` uuid pk
- `document_id` uuid not null
- `user_id` uuid not null
- `permission` varchar not null
- `granted_by_user_id` uuid not null
- `revoked_by_user_id` uuid null
- `granted_at` timestamptz not null
- `revoked_at` timestamptz null
- `expires_at` timestamptz null
- `is_active` boolean not null default true

Restricciones:

- unique parcial por `document_id` + `user_id` + `permission` cuando `is_active = true`
- `permission` solo acepta valores del catalogo definido

Catalogo de permisos:

- `view`
- `comment`
- `download`
- `edit_metadata`
- `upload_version`
- `move_state`
- `approve`
- `manage_permissions`
- `share`

Notas:

- `document_id` referencia logica a `document-service`
- `user_id` y `granted_by_user_id` referencian logicamente a `auth-service`
- los permisos no se eliminan, se revocan con `is_active = false`
- `expires_at` permite permisos temporales para el futuro

### 4. `notifications`

Notificaciones internas del sistema para cada usuario.

Campos sugeridos:

- `id` uuid pk
- `user_id` uuid not null
- `type` varchar not null
- `document_id` uuid null
- `triggered_by_user_id` uuid null
- `payload` jsonb null
- `is_read` boolean not null default false
- `read_at` timestamptz null
- `created_at` timestamptz not null

Restricciones:

- `user_id` obligatorio
- `type` solo acepta valores del catalogo definido

Tipos de notificacion sugeridos:

- `asignacion_encargado`
- `nueva_asignacion`
- `cambio_estado`
- `nuevo_comentario`
- `mencion`
- `permiso_otorgado`
- `permiso_revocado`

Notas:

- `document_id` referencia logica a `document-service`
- `triggered_by_user_id` referencia logica a `auth-service`
- `payload` permite incluir contexto adicional sin crear tablas especificas por tipo

### 5. `activities`

Registro auditable de todas las acciones relevantes sobre los documentos.

Campos sugeridos:

- `id` uuid pk
- `document_id` uuid not null
- `actor_user_id` uuid not null
- `action` varchar not null
- `payload` jsonb null
- `created_at` timestamptz not null

Restricciones:

- `document_id` obligatorio
- `actor_user_id` obligatorio
- `action` no nulo
- las filas de actividad son inmutables una vez creadas

Acciones sugeridas para el catalogo:

- `documento_creado`
- `estado_cambiado`
- `encargado_asignado`
- `persona_asignada`
- `persona_desasignada`
- `comentario_agregado`
- `comentario_resuelto`
- `permiso_otorgado`
- `permiso_revocado`
- `archivo_cargado`
- `version_subida`
- `metadata_editada`

Notas:

- `document_id` referencia logica a `document-service`
- `actor_user_id` referencia logica a `auth-service`
- `payload` guarda el contexto relevante del evento como estado anterior, estado nuevo, rol asignado, etc.
- este registro nunca se edita ni se borra

## Relaciones

- `comments` 1 -> N `mentions`
- `document_permissions` N -> 1 `document_id` (logico)
- `notifications` N -> 1 `user_id` (logico)
- `activities` N -> 1 `document_id` (logico)

## Diagrama relacional sugerido

```mermaid
erDiagram
    comments ||--o{ mentions : contains

    comments {
        uuid id PK
        uuid document_id
        uuid document_version_id
        uuid author_user_id
        text body
        boolean is_resolved
        uuid resolved_by_user_id
        timestamptz resolved_at
        timestamptz created_at
        timestamptz updated_at
    }

    mentions {
        uuid id PK
        uuid comment_id FK
        uuid mentioned_user_id
        timestamptz created_at
    }

    document_permissions {
        uuid id PK
        uuid document_id
        uuid user_id
        varchar permission
        uuid granted_by_user_id
        uuid revoked_by_user_id
        timestamptz granted_at
        timestamptz revoked_at
        timestamptz expires_at
        boolean is_active
    }

    notifications {
        uuid id PK
        uuid user_id
        varchar type
        uuid document_id
        uuid triggered_by_user_id
        jsonb payload
        boolean is_read
        timestamptz read_at
        timestamptz created_at
    }

    activities {
        uuid id PK
        uuid document_id
        uuid actor_user_id
        varchar action
        jsonb payload
        timestamptz created_at
    }
```

## PK, indices y reglas de integridad internas

Indices sugeridos:

- indice en `comments.document_id`
- indice en `comments.author_user_id`
- indice en `mentions.comment_id`
- indice en `mentions.mentioned_user_id`
- indice en `document_permissions.document_id`
- indice en `document_permissions.user_id`
- indice en `document_permissions.is_active`
- indice en `notifications.user_id`
- indice en `notifications.is_read`
- indice en `notifications.created_at`
- indice en `activities.document_id`
- indice en `activities.created_at`

Reglas de integridad:

- un permiso activo no puede duplicarse para el mismo usuario, documento y tipo de permiso
- las actividades son inmutables
- las notificaciones no se eliminan, se marcan como leidas
- los permisos no se eliminan, se revocan con `is_active = false`

## Limite con workflow-service

- `workflow-service` define quien participa y con que rol operativo
- `collaboration-service` aplica los permisos efectivos
- cuando `workflow-service` asigna a alguien, `collaboration-service` puede recibir una llamada para crear permisos por defecto segun el rol
- cuando `workflow-service` desasigna, `collaboration-service` debe revocar los permisos derivados de esa asignacion

## Limite con document-service

- `collaboration-service` usa `document_id` como referencia logica
- `collaboration-service` no modifica metadata documental
- `collaboration-service` registra la actividad de cambios que ocurren en otros servicios

## Reglas de implementacion para el MVP

- usar `uuid` como PK en todas las tablas
- `collaboration-service` migra solo el schema `collaboration`
- los eventos de actividad deben registrarse tanto desde este servicio como desde otros servicios via llamada HTTP interna
- no usar FK cruzadas entre schemas
- el campo `payload` en `activities` y `notifications` debe ser suficiente para mostrar contexto sin joins a otros servicios

## Criterio de cierre de la tarjeta

La tarjeta se considera cerrada cuando:

- existe un DER claro de `collaboration-service`
- se conocen tablas, relaciones y restricciones
- el catalogo de permisos documentales queda definido
- el catalogo de tipos de notificacion queda definido
- el catalogo de acciones auditables queda definido
- el limite con `workflow-service` y `document-service` queda explicito
- el servicio queda listo para pasar a migracion inicial
