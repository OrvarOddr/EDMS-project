# Project Foundation

Este documento resume el proyecto en una sola fuente de verdad para reiniciar la implementación sin perderse entre archivos.

## 1. Qué estamos construyendo

`EDMS` es una plataforma de gestión documental con:

- autenticación y control de acceso
- documentos con metadata y versionado
- workflow por estados
- asignación de encargado y personas
- colaboración y trazabilidad
- almacenamiento físico de archivos

El documento es la entidad central del negocio.

## 2. Problema que resuelve

El sistema busca evitar:

- archivos dispersos
- falta de responsable claro por documento
- ausencia de trazabilidad
- pérdida de versiones válidas
- permisos informales
- poca visibilidad del estado operativo del trabajo documental

## 3. Bloque 1. Dominio base ya cerrado

Este bloque fija el lenguaje oficial del proyecto.

Su alcance termina en:

- entidades del negocio
- bounded contexts
- reglas base
- distinciones conceptuales
- modelo conceptual de encargado y personas asignadas

Este bloque no resuelve todavia:

- contratos HTTP entre servicios
- schemas por servicio
- DER detallado por servicio
- orden exacto de implementacion tecnica

### Reglas del negocio

- cada documento tiene un único `encargado` vigente
- cada documento puede tener múltiples personas asignadas
- cada persona asignada puede tener un rol interno sobre el documento
- revisores y aprobadores deben estar asignados al documento
- al quitar una asignación, sus permisos documentales asociados se revocan salvo excepción administrada

### Bounded contexts

- `Auth`
- `Documents`
- `Workflow`
- `Collaboration`
- `Files`

### Entidades principales

#### Auth

- `User`
- `Role`
- `UserRole`
- `RefreshToken`

#### Documents

- `Document`
- `DocumentVersion`
- `DocumentType`
- `Expedient`

#### Workflow

- `DocumentState`
- `StateTransition`
- `DocumentAssignment`
- `AssignmentRole`
- `StateHistory`

#### Collaboration

- `Comment`
- `Mention`
- `DocumentPermission`
- `Notification`
- `Activity`

#### Files

- `StoredFile`
- `FileUpload`

### Distinciones clave del dominio

Estas definiciones son obligatorias para evitar mezclar conceptos en diseño e implementación:

- `rol global`: capacidad general de un usuario en el sistema. Vive en `Auth`.
- `propietario documental`: referencia responsable o titular del documento a nivel metadata. Vive en `Documents`.
- `asignacion documental`: vínculo operativo entre un usuario y un documento. Vive en `Workflow`.
- `rol interno`: rol operativo de una asignación documental, por ejemplo `encargado`, `revisor` o `lector`. Vive en `Workflow`.
- `permiso documental`: grant específico de colaboración sobre un documento, por ejemplo `comment`, `download` o `approve`. Vive en `Collaboration`.

Reglas:

- el propietario documental no reemplaza al encargado operativo
- una asignación no reemplaza un permiso documental
- un permiso documental no reemplaza una asignación operativa
- un rol interno no reemplaza un rol global
- el permiso efectivo final de un usuario puede depender de más de una de estas capas

### Alcance del dominio en MVP v1

#### Entidades que entran al MVP v1

- `User`
- `Role`
- `UserRole`
- `RefreshToken`
- `Document`
- `DocumentVersion`
- `DocumentType`
- `Expedient`
- `DocumentState`
- `StateTransition`
- `DocumentAssignment`
- `AssignmentRole`
- `StateHistory`
- `StoredFile`
- `FileUpload`

#### Entidades que quedan definidas, pero no necesariamente implementadas completas en el primer corte

- `Comment`
- `Mention`
- `DocumentPermission`
- `Notification`
- `Activity`

Nota:

- estas entidades siguen siendo parte del dominio oficial
- que no entren completas al primer corte tecnico no significa que salgan del modelo

### Estado del Bloque 1

El Bloque 1 se considera cerrado con estas decisiones:

- entidades principales definidas
- bounded contexts definidos
- relaciones conceptuales entre contextos definidas
- reglas base del negocio definidas
- distinciones entre rol global, asignación, rol interno y permiso documental definidas
- alcance de dominio para MVP v1 definido

### Decisiones congeladas del Bloque 1

Estas decisiones no deberian reabrirse en bloques posteriores salvo cambio de producto explicitamente acordado:

- el documento es la entidad central del negocio
- el sistema se separa en `Auth`, `Documents`, `Workflow`, `Collaboration` y `Files`
- el creador del documento queda como `encargado` inicial por defecto
- el encargado se modela como una asignacion documental, no como campo propio del documento
- revisores y aprobadores deben estar asignados al documento
- permisos documentales y asignaciones documentales son conceptos distintos
- el propietario documental no reemplaza al encargado operativo

### Documentos que cierran el Bloque 1

El Bloque 1 queda realmente cerrado cuando estos documentos no se contradicen entre si:

- `foundation/PROJECT-FOUNDATION.md`
- `domain/domain-model-and-bounded-contexts.md`
- `domain/document-assignments-and-internal-roles-model.md`

### Siguiente paso despues del Bloque 1

Con el Bloque 1 cerrado, el proyecto pasa a:

- `architecture/contracts-and-service-ownership.md`
- `architecture/database-schemas-by-service.md`

## 4. Arquitectura elegida

El proyecto se implementará con arquitectura de microservicios.

### Microservicios previstos

- `api-gateway`
- `auth-service`
- `document-service`
- `workflow-service`
- `collaboration-service`
- `file-service`
- `frontend`

### Reglas de arquitectura

- el frontend entra solo por `api-gateway`
- cada servicio tiene ownership funcional claro
- ningún servicio lee tablas de otro servicio
- la integración entre servicios se hace por HTTP interno
- PostgreSQL se usa con un schema por servicio en el MVP
- `api-gateway` valida localmente el `access_token` emitido por `auth-service`

## 5. Ownership por servicio

### auth-service

Dueño de:

- usuarios
- roles globales
- autenticación
- refresh tokens

### document-service

Dueño de:

- documentos
- metadata
- tipos documentales
- expedientes
- versiones lógicas

### workflow-service

Dueño de:

- estado actual del documento
- transiciones
- historial de estado
- encargado
- personas asignadas
- roles internos de asignación

### collaboration-service

Dueño de:

- comentarios
- menciones
- permisos por documento
- notificaciones
- actividad

### file-service

Dueño de:

- uploads
- downloads
- validación de archivo
- referencia física en storage

### api-gateway

Responsable de:

- entrada única al sistema
- routing hacia servicios internos
- concerns de borde

No debe implementar lógica de negocio.

## Estado del Bloque 2

El Bloque 2 se considera cerrado con estas decisiones:

- cada microservicio tiene ownership funcional claro
- cada entidad principal tiene un duenio unico
- las fronteras entre servicios quedan definidas
- la integracion del MVP entre servicios se hace por HTTP interno
- el frontend entra solo por `api-gateway`
- ningun microservicio lee tablas de otro microservicio
- `workflow-service` es duenio de encargado y personas asignadas
- `document-service` no guarda asignaciones documentales como fuente de verdad
- `collaboration-service` no administra asignaciones documentales
- `api-gateway` no implementa logica de negocio del dominio
- cada servicio con persistencia propia usa un schema dedicado
- los servicios intercambian IDs logicos oficiales emitidos por su servicio duenio
- quedan definidos contratos minimos por servicio a nivel conceptual

## Documentos que cierran el Bloque 2

El Bloque 2 queda realmente cerrado cuando estos documentos no se contradicen entre si:

- `architecture/microservices-architecture.md`
- `architecture/contracts-and-service-ownership.md`
- `architecture/database-schemas-by-service.md`

## 6. Persistencia del MVP

Se usará:

- una instancia de `PostgreSQL`
- un schema por servicio
- `MinIO` para almacenamiento físico de archivos

Schemas iniciales:

- `auth`
- `documents`
- `workflow`
- `collaboration`
- `files`

Mapeo:

- `auth-service` -> `auth`
- `document-service` -> `documents`
- `workflow-service` -> `workflow`
- `collaboration-service` -> `collaboration`
- `file-service` -> `files`

Restricciones:

- `api-gateway` no tiene schema propio
- `frontend` no tiene schema propio
- no existen joins ni FK cruzadas entre servicios
- los servicios se relacionan por IDs logicos y HTTP interno

## 7. MVP v1

El primer corte funcional del proyecto debe permitir:

- iniciar sesión
- cerrar sesión
- crear usuario
- consultar catalogo de roles globales
- asignar rol global
- consultar tipos documentales
- crear y listar expedientes base
- crear documento
- cargar archivo principal
- listar documentos
- ver detalle base de documento
- dejar el documento en estado `Borrador`
- dejar al creador como `encargado` inicial

### Reglas mínimas del MVP

- el dominio define que un documento nace en estado `Borrador`
- el dominio define que el creador queda como `encargado` inicial
- el archivo principal se almacena en `MinIO`
- PostgreSQL guarda metadata y referencias lógicas
- `workflow-service` minimo entra en el primer corte tecnico para materializar `Borrador` y la asignacion inicial de `encargado`
- `document-service` no persiste estado ni asignaciones documentales como fuente de verdad, tampoco de forma temporal
- la creacion de documento solo se considera cerrada cuando `workflow-service` registra el bootstrap operativo del documento

Regla de autenticacion de borde:

- `api-gateway` valida el `access_token` localmente con el JWT emitido por `auth-service`
- `auth-service` sigue siendo el unico emisor y duenio del material de firma
- el gateway no hace introspeccion sincronica por request para validar el token del frontend

## 8. Primer corte técnico

La implementación debe empezar por:

- `api-gateway`
- `auth-service`
- `document-service`
- `file-service`
- `workflow-service` minimo
- `frontend`

Después se agregan:

- `collaboration-service`

## 9. Orden recomendado de implementación

1. estructura base del repositorio
2. `auth-service`
3. `file-service`
4. `document-service`
5. `workflow-service`
6. `api-gateway`
7. `frontend`
8. `collaboration-service`

## 10. Documentos de apoyo

Para detalles específicos usar:

- `../product/product-blueprint.md`
- `../domain/domain-model-and-bounded-contexts.md`
- `../architecture/contracts-and-service-ownership.md`
- `../architecture/database-schemas-by-service.md`
- `../domain/document-assignments-and-internal-roles-model.md`
- `../data/*-service-der.md`
- `../product/user-stories-backlog.md`
