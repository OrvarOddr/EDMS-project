# Contratos y Ownership entre Microservicios

## Objetivo

Definir que datos, procesos y endpoints pertenecen a cada microservicio para evitar acoplamiento indebido y cruces de responsabilidad.

## Regla general

- cada microservicio tiene un duenio funcional claro
- cada entidad tiene un duenio unico
- un servicio no puede leer tablas de otro servicio
- la integracion entre servicios se hace por HTTP interno en el MVP
- el `api-gateway` expone la entrada unica al frontend

## Ownership por microservicio

### 1. auth-service

Es duenio de:

- usuarios
- roles globales
- tokens de acceso
- refresh tokens
- autenticacion

Entidades:

- `User`
- `Role`
- `UserRole`
- `RefreshToken`

Expone:

- login
- refresh token
- consulta de usuario autenticado
- validacion de identidad

No debe manejar:

- documentos
- estados documentales
- comentarios
- permisos por documento
- archivos

### 2. document-service

Es duenio de:

- documentos
- metadata documental
- versiones logicas
- tipos documentales
- expedientes
- etiquetas de clasificacion y sus asociaciones a documentos

Entidades:

- `Document`
- `DocumentVersion`
- `DocumentType`
- `Expedient`
- `Tag`
- `DocumentTag`

Expone:

- crear documento
- listar documentos
- obtener detalle documental base
- editar metadata
- consultar versiones

No debe manejar:

- encargado del documento
- personas asignadas
- comentarios
- permisos
- archivos fisicos

### 3. workflow-service

Es duenio de:

- estado actual del documento
- transiciones de estado
- historial de estados
- encargado del documento
- personas asignadas
- roles internos de asignacion

Entidades:

- `DocumentState`
- `StateTransition`
- `StateHistory`
- `DocumentAssignment`
- `AssignmentRole`

Expone:

- consultar estado del documento
- mover documento entre estados
- asignar encargado
- gestionar personas asignadas
- consultar asignaciones

No debe manejar:

- metadata del documento
- comentarios
- permisos
- archivos fisicos

### 4. collaboration-service

Es duenio de:

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

Expone:

- comentar documento
- consultar comentarios
- otorgar permisos
- quitar permisos
- consultar actividad
- consultar notificaciones

No debe manejar:

- metadata del documento
- estados documentales
- personas asignadas como fuente de verdad
- archivos fisicos

### 5. file-service

Es duenio de:

- uploads
- downloads
- validacion de archivo
- referencias fisicas a storage

Entidades:

- `StoredFile`
- `FileUpload`

Expone:

- subir archivo
- descargar archivo
- consultar metadata del archivo

No debe manejar:

- metadata documental
- estados
- comentarios
- permisos operativos

### 6. api-gateway

Es duenio de:

- entrada unica al sistema para el frontend
- enrutamiento a servicios internos
- CORS
- versionado de rutas publicas

Expone:

- `/api/auth/*`
- `/api/documents/*`
- `/api/workflows/*`
- `/api/collaboration/*`
- `/api/files/*`

No debe manejar:

- logica de negocio documental
- persistencia
- ownership de entidades

## Contratos conceptuales entre servicios

### auth-service -> resto

- provee identidad de usuario por `user_id`
- provee contexto de rol global

### workflow-service -> document-service

- consume `document_id`
- workflow consulta existencia logica del documento en `document-service`
- workflow no modifica metadata documental

### document-service -> file-service

- document-service referencia archivos subidos por `file_id`
- file-service no modifica versiones logicas del documento

### workflow-service -> collaboration-service

- workflow genera eventos de asignacion y cambio de estado
- collaboration genera notificaciones y actividad a partir de esos cambios

### collaboration-service -> workflow-service

- puede consultar contexto minimo del documento por `document_id`
- no modifica estado ni asignaciones del documento

## Identificadores compartidos del sistema

Estos IDs son referencias logicas oficiales entre servicios:

- `user_id`: lo emite `auth-service` y lo consumen los demas servicios como referencia de usuario
- `role_id`: lo emite `auth-service` y se usa solo para autorizacion global
- `document_id`: lo emite `document-service` y lo consumen `workflow-service` y `collaboration-service`
- `document_version_id`: lo emite `document-service` para identificar versiones logicas
- `file_id`: lo emite `file-service` y lo referencia `document-service`
- `expedient_id`: lo emite `document-service` para agrupacion logica documental
- `comment_id`, `notification_id`, `activity_id`: los emite `collaboration-service`
- `assignment_id`, `state_history_id`: los emite `workflow-service`

Reglas:

- cada ID tiene un unico servicio emisor
- los otros servicios solo lo referencian
- un servicio no redefine ni reescribe IDs emitidos por otro
- la validez de un ID externo se resuelve por API, no por acceso a tablas ajenas

## Contratos minimos del MVP por servicio

Estos contratos todavia no son un OpenAPI final, pero fijan que operaciones minimas debe resolver cada servicio y que informacion intercambia con otros.

Nota:

- los contratos de `auth-service`, `document-service`, `file-service`, `workflow-service` minimo, `api-gateway` y `frontend` pertenecen al primer corte tecnico
- el contrato de `collaboration-service` queda definido en este bloque para congelar ownership e integraciones, aunque su implementacion completa puede entrar despues del primer corte tecnico

### api-gateway

Entrada:

- recibe todas las llamadas del frontend
- valida concerns de borde como autenticacion, CORS y versionado publico
- enruta hacia microservicios internos

Salida:

- expone rutas publicas bajo `/api/*`
- devuelve al frontend las respuestas de los servicios internos

Dependencias permitidas:

- `auth-service`
- `document-service`
- `workflow-service`
- `collaboration-service`
- `file-service`

Regla congelada del MVP para `access_token`:

- `api-gateway` valida localmente firma, expiracion, `issuer` y `audience` del JWT emitido por `auth-service`
- `auth-service` sigue siendo el unico emisor del token y el unico duenio del material de firma
- el gateway no hace introspeccion sincronica por request para validar el `access_token` del frontend
- solo usuarios con `status = active` pueden recibir tokens validos de sesion; usuarios `inactive` o `blocked` deben rechazarse en login
- el `access_token` debe incluir al menos `sub`, `email`, `status`, `roles`, `iss`, `aud`, `exp`, `iat` y `type = access`
- el frontend puede usar los claims del `access_token` para proteccion basica de rutas, pero `GetCurrentUser` sigue siendo la consulta autoritativa del usuario autenticado
- el login exitoso debe persistir el refresh token solo por hash y actualizar `last_login_at` del usuario autenticado
- login, refresh y consulta de usuario autenticado siguen resolviendose en `auth-service`

### auth-service

Entrada minima:

- `LoginRequest(email, password)`
- `RefreshRequest(refresh_token)`
- `GetCurrentUser(access_token)`
- `ListRoles()`
- `CreateUser(...)`
- `AssignGlobalRole(user_id, role_id)`

Salida minima:

- `TokenResponse(access_token, refresh_token, token_type)`
- `CurrentUser(user_id, email, status, roles[])`
- `UserSummary(user_id, email, status, roles[])`
- `RoleCatalogItem(role_id, code, name, description?)`

IDs que emite:

- `user_id`
- `role_id`

Dependencias permitidas:

- ninguna dependencia funcional a otros servicios del dominio

### document-service

Entrada minima:

- `CreateDocument(title, description?, document_type_id?, expedient_id?, created_by_user_id, owner_user_id?)`
- `ListDocuments(filters?)`
- `GetDocument(document_id)`
- `ListDocumentTypes()`
- `ListExpedients(filters?)`
- `CreateExpedient(code?, title, description?, created_by_user_id)`
- `UpdateDocumentMetadata(document_id, ...)`
- `RegisterDocumentVersion(document_id, file_id, uploaded_by_user_id, version_comment?)`
- `ListTags()`
- `CreateTag(label, color, created_by_user_id)`
- `UpdateTag(tag_id, label, color)`
- `DeleteTag(tag_id)`
- `GetDocumentTags(document_id)`
- `AssignTagToDocument(document_id, tag_id)`
- `RemoveTagFromDocument(document_id, tag_id)`

Salida minima:

- `DocumentCreated(document_id, code, created_at, owner_user_id, created_by_user_id)`
- `DocumentSummary(document_id, code, title, document_type_id, expedient_id, created_at)`
- `DocumentDetail(document_id, metadata..., versions[])`
- `DocumentTypeCatalogItem(document_type_id, code, name, description?)`
- `ExpedientCreated(expedient_id, code, title, created_at)`
- `ExpedientSummary(expedient_id, code, title, status?)`
- `DocumentVersionCreated(document_version_id, document_id, version_number, file_id)`

IDs que emite:

- `document_id`
- `document_version_id`
- `expedient_id`
- `document_type_id`

Dependencias permitidas:

- consume `file_id` emitido por `file-service`
- consume `user_id` emitido por `auth-service` como referencia logica
- puede invocar `workflow-service` solo para inicializar estado `Borrador` y asignacion inicial de `encargado` al crear un documento

### file-service

Entrada minima:

- `UploadFile(binary, filename, content_type, uploaded_by_user_id?)`
- `DownloadFile(file_id)`
- `GetFileMetadata(file_id)`

Salida minima:

- `FileStored(file_id, original_filename, mime_type, size_bytes, checksum)`
- `FileMetadata(file_id, original_filename, mime_type, size_bytes, checksum)`
- stream binario para descarga

IDs que emite:

- `file_id`

Dependencias permitidas:

- consume `user_id` solo como referencia opcional de auditoria
- no depende funcionalmente de otros servicios del dominio

### workflow-service

Entrada minima:

- `InitializeWorkflow(document_id, creator_user_id)`
- `GetWorkflow(document_id)`
- `TransitionDocumentState(document_id, target_state, actor_user_id, comment?)`
- `AssignDocumentUser(document_id, user_id, internal_role, assigned_by_user_id)`
- `ReassignEncargado(document_id, new_encargado_user_id, assigned_by_user_id)`
- `ListAssignments(document_id)`

Salida minima:

- `WorkflowSummary(document_id, current_state, encargado_assignment, assignments[])`
- `StateChanged(document_id, previous_state, current_state, changed_by_user_id, changed_at)`
- `AssignmentCreated(assignment_id, document_id, user_id, internal_role)`

IDs que emite:

- `assignment_id`
- `state_history_id`

Dependencias permitidas:

- consume `document_id` emitido por `document-service`
- consume `user_id` emitido por `auth-service`
- puede emitir eventos o llamadas hacia `collaboration-service` para actividad y notificaciones

Regla minima del primer corte:

- `InitializeWorkflow` debe materializar el estado `Borrador` y la asignacion inicial de `encargado`
- la creacion de documento no se considera cerrada en el MVP hasta que `workflow-service` registre ese bootstrap operativo

### collaboration-service

Entrada minima:

- `CreateComment(document_id, author_user_id, body, mentions[])`
- `ListComments(document_id)`
- `GrantDocumentPermission(document_id, user_id, permissions[], granted_by_user_id, expires_at?)`
- `RevokeDocumentPermission(document_id, user_id, permissions[])`
- `ListDocumentActivity(document_id)`
- `ListNotifications(user_id)`

Salida minima:

- `CommentCreated(comment_id, document_id, author_user_id, created_at)`
- `PermissionGrantResult(document_id, user_id, permissions[], expires_at?)`
- `ActivityItem(activity_id, document_id, type, actor_user_id, created_at)`
- `NotificationItem(notification_id, user_id, type, created_at, read_at?)`

IDs que emite:

- `comment_id`
- `notification_id`
- `activity_id`

Dependencias permitidas:

- consume `document_id` emitido por `document-service`
- consume `user_id` emitido por `auth-service`
- puede consumir contexto minimo de `workflow-service` para enriquecer actividad o validar reglas de colaboracion

## Dependencias sincronas permitidas en el MVP

Estas dependencias estan permitidas a nivel conceptual:

- `api-gateway` -> todos los servicios internos
- `document-service` -> `file-service`
- `document-service` -> `workflow-service` solo para inicializar workflow al crear el documento
- `workflow-service` -> `document-service`
- `workflow-service` -> `auth-service` solo por referencia de identidad o validacion minima
- `collaboration-service` -> `document-service`
- `collaboration-service` -> `workflow-service`

No se consideran dependencias permitidas:

- `document-service` -> `workflow-service` para decidir metadata documental
- `document-service` -> `collaboration-service`
- `file-service` -> `document-service`
- `file-service` -> `workflow-service`
- `file-service` -> `collaboration-service`

## Lo que todavia no cierra esta tarjeta

Esta tarjeta no deja cerrado todavia:

- paths HTTP finales
- status codes
- payloads JSON definitivos
- autenticacion tecnica entre servicios internos que no involucre la validacion del `access_token` del frontend en `api-gateway`
- timeouts, retries y observabilidad
- eventos asincronos futuros

## Reglas de integracion

- toda integracion entre servicios se hace por HTTP interno en el MVP
- la comunicacion se hace por IDs logicos, no por joins entre bases
- los servicios deben tolerar datos distribuidos
- el frontend no conversa directo con microservicios internos, solo con `api-gateway`
- la validacion del `access_token` del frontend en `api-gateway` se resuelve localmente con JWT emitido por `auth-service`

## Fronteras para evitar duplicacion

- solo `workflow-service` puede decidir quien es el encargado vigente
- solo `workflow-service` puede decidir quienes estan asignados a un documento
- solo `document-service` puede modificar metadata documental
- solo `auth-service` puede administrar el catalogo de roles globales
- solo `document-service` puede administrar tipos documentales y expedientes
- solo `collaboration-service` puede administrar permisos por documento
- solo `file-service` puede administrar archivos fisicos
- solo `auth-service` puede administrar autenticacion y roles globales

## Zonas que quedan explicitamente cerradas

- `document-service` no guardara personas asignadas como fuente de verdad
- `collaboration-service` no administrara asignaciones documentales
- `workflow-service` no administrara comentarios ni permisos
- `api-gateway` no implementara reglas de negocio del dominio

## Salida esperada de esta tarjeta

- cada microservicio tiene responsabilidad funcional clara
- cada entidad tiene un duenio unico
- los contratos entre servicios estan claros a nivel conceptual
- no quedan zonas grises sobre quien administra documentos, asignaciones, comentarios o archivos

## Decisiones congeladas del Bloque 2

Estas decisiones no deberian reabrirse durante la implementacion salvo cambio de producto explicitamente acordado:

- `auth-service` es el unico duenio de identidad, autenticacion, roles globales y refresh tokens
- `document-service` es el unico duenio de documentos, metadata, tipos documentales, expedientes y versiones logicas
- `workflow-service` es el unico duenio de estado documental, encargado, personas asignadas, roles internos e historial de estado
- `collaboration-service` es el unico duenio de comentarios, menciones, permisos documentales, notificaciones y actividad
- `file-service` es el unico duenio del almacenamiento fisico y su referencia logica
- `api-gateway` solo resuelve concerns de borde y routing; no implementa logica de negocio
- ningun servicio lee tablas de otro servicio como dependencia normal del negocio
- la integracion entre servicios se hace por HTTP interno en el MVP
- la integracion entre servicios usa IDs logicos, no joins entre bases

## Criterio de cierre del Bloque 2

El Bloque 2 se considera cerrado cuando:

- ownership por microservicio queda definido sin contradicciones con el Bloque 1
- cada entidad principal tiene un duenio unico
- las fronteras entre servicios estan documentadas
- queda explicito que datos y procesos no deben duplicarse
- quedan definidos los contratos conceptuales minimos entre servicios
- queda claro que servicios entran en el primer corte tecnico y cuales quedan para despues

## Siguiente paso despues del Bloque 2

Con el Bloque 2 cerrado, el proyecto pasa a:

- `architecture/database-schemas-by-service.md`
- `data/auth-service-der.md`
- `data/document-service-der.md`
- `data/file-service-der.md`
- `data/workflow-service-der.md`
- `data/collaboration-service-der.md`
