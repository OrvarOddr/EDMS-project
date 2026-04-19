# DER de file-service

## Objetivo

Diseñar el modelo entidad-relacion del servicio de archivos para soportar:

- registro de archivos fisicos almacenados
- historial de uploads por documento y version

## Scope del servicio

`file-service` es duenio de:

- almacenamiento fisico de archivos en MinIO o disco local
- metadata del archivo almacenado como nombre, MIME, tamaño y ruta
- trazabilidad de quien subio cada archivo y cuando

No debe guardar:

- version logica del documento
- estado del documento
- metadata documental
- permisos documentales
- comentarios

## Entidades del DER

### 1. `stored_files`

Registro de cada archivo fisico almacenado en el sistema.

Campos sugeridos:

- `id` uuid pk
- `original_filename` varchar not null
- `stored_filename` varchar not null
- `mime_type` varchar not null
- `size_bytes` bigint not null
- `storage_backend` varchar not null
- `storage_path` varchar not null
- `checksum` varchar null
- `uploader_user_id` uuid not null
- `uploaded_at` timestamptz not null

Restricciones:

- `original_filename` no nulo
- `stored_filename` no nulo y unico dentro del backend de almacenamiento
- `mime_type` solo acepta valores del catalogo permitido
- `size_bytes` mayor que cero
- `storage_backend` solo acepta valores definidos

Valores sugeridos para `storage_backend`:

- `local`
- `minio`

Tipos MIME permitidos para el MVP:

- `application/pdf`
- `image/png`
- `image/jpeg`

Notas:

- `uploader_user_id` es referencia logica a `auth-service`
- `storage_path` es la ruta interna dentro del backend, no una URL publica
- `checksum` puede usarse para verificar integridad del archivo al descargarlo
- `document-service` guarda el `id` de esta tabla como referencia logica en `document_versions.file_id`

### 2. `file_uploads`

Historial de operaciones de upload para trazabilidad y auditoria.

Campos sugeridos:

- `id` uuid pk
- `stored_file_id` uuid not null
- `document_id` uuid null
- `document_version_id` uuid null
- `uploader_user_id` uuid not null
- `upload_status` varchar not null
- `error_message` text null
- `started_at` timestamptz not null
- `completed_at` timestamptz null

Restricciones:

- `stored_file_id` obligatorio
- `uploader_user_id` obligatorio
- `upload_status` solo acepta valores del catalogo definido

Valores sugeridos para `upload_status`:

- `pending`
- `completed`
- `failed`

Notas:

- `document_id` y `document_version_id` son referencias logicas a `document-service`
- `uploader_user_id` referencia logica a `auth-service`
- esta tabla permite detectar uploads incompletos o fallidos
- una vez completado el upload, `document-service` recibe el `file_id` logico, que corresponde al `id` de `stored_files`

## Relaciones

- `stored_files` 1 -> N `file_uploads`

## Diagrama relacional sugerido

```mermaid
erDiagram
    stored_files ||--o{ file_uploads : tracks

    stored_files {
        uuid id PK
        varchar original_filename
        varchar stored_filename
        varchar mime_type
        bigint size_bytes
        varchar storage_backend
        varchar storage_path
        varchar checksum
        uuid uploader_user_id
        timestamptz uploaded_at
    }

    file_uploads {
        uuid id PK
        uuid stored_file_id FK
        uuid document_id
        uuid document_version_id
        uuid uploader_user_id
        varchar upload_status
        text error_message
        timestamptz started_at
        timestamptz completed_at
    }
```

## PK, indices y reglas de integridad internas

Indices sugeridos:

- indice en `stored_files.uploader_user_id`
- indice en `stored_files.uploaded_at`
- indice en `stored_files.mime_type`
- indice en `file_uploads.stored_file_id`
- indice en `file_uploads.document_id`
- indice en `file_uploads.upload_status`

Reglas de integridad:

- el `size_bytes` debe validarse antes de persistir
- el `mime_type` debe validarse contra el catalogo permitido antes de persistir
- no se eliminan registros de `stored_files` sin una politica de retencion definida
- un archivo fisico en el backend de almacenamiento siempre debe tener su fila correspondiente en `stored_files`

## Limite con document-service

- `file-service` es la fuente de verdad del archivo fisico
- `document-service` guarda solo `file_id` como referencia logica en `document_versions`
- `document-service` no accede directamente al storage
- la descarga de un archivo siempre pasa por `file-service`

## Limite con collaboration-service

- `file-service` no administra permisos de descarga
- `collaboration-service` define quien tiene permiso `download`
- el control de acceso antes de servir un archivo debe validarse contra `collaboration-service` via `api-gateway`

## Reglas de implementacion para el MVP

- usar `uuid` como PK en todas las tablas
- `file-service` migra solo el schema `files`
- el backend de almacenamiento para el MVP es `local` o `minio` segun la variable de entorno `STORAGE_BACKEND`
- el tamaño maximo de archivo para el MVP es 10 MB
- los tipos MIME validos para el MVP son `application/pdf`, `image/png` e `image/jpeg`
- no exponer rutas internas de almacenamiento al cliente

## Criterio de cierre de la tarjeta

La tarjeta se considera cerrada cuando:

- existe un DER claro de `file-service`
- se conocen tablas, relaciones y restricciones
- el limite con `document-service` queda explicito
- el limite con `collaboration-service` queda explicito
- las reglas de validacion de MIME y tamaño quedan documentadas
- el servicio queda listo para pasar a migracion inicial
