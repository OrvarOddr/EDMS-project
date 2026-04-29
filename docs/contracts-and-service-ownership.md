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

Entidades:

- `Document`
- `DocumentVersion`
- `DocumentType`
- `Expedient`

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

### document-service -> workflow-service

- comparte `document_id`
- workflow consulta existencia logica del documento
- workflow no modifica metadata documental

### document-service -> file-service

- document-service referencia archivos subidos por `file_id` o equivalente
- file-service no modifica versiones logicas del documento

### workflow-service -> collaboration-service

- workflow genera eventos de asignacion y cambio de estado
- collaboration genera notificaciones y actividad a partir de esos cambios

### collaboration-service -> workflow-service

- puede consultar contexto minimo del documento por `document_id`
- no modifica estado ni asignaciones del documento

## Reglas de integracion

- toda integracion entre servicios se hace por HTTP interno en el MVP
- la comunicacion se hace por IDs logicos, no por joins entre bases
- los servicios deben tolerar datos distribuidos
- el frontend no conversa directo con microservicios internos, solo con `api-gateway`

## Fronteras para evitar duplicacion

- solo `workflow-service` puede decidir quien es el encargado vigente
- solo `workflow-service` puede decidir quienes estan asignados a un documento
- solo `document-service` puede modificar metadata documental
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
