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

- document-service referencia archivos subidos por `file_id`
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
