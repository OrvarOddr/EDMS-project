# Blueprint de Producto

## 1. Vision

El sistema sera una plataforma de gestion documental con flujo de trabajo, colaboracion y trazabilidad. Cada documento funcionara como una tarjeta operativa dentro de un kanban: tendra un encargado, personas asignadas, estado, comentarios, permisos, versiones e historial completo de cambios.

La propuesta no apunta solo a almacenar archivos. El objetivo es controlar el ciclo de vida del documento desde su creacion o carga, pasando por revision y aprobacion, hasta su archivo o vencimiento.

## 2. Objetivo del producto

Construir un sistema web que permita:

- centralizar documentos y expedientes
- ordenar el trabajo documental por estados
- asignar encargados, personas y revisores
- colaborar mediante comentarios y menciones
- controlar acceso con permisos granulares
- mantener versionado e historial auditable
- facilitar seguimiento operativo con dashboard, filtros y tablero kanban

## 3. Problema que resuelve

Actualmente la gestion documental suele fallar por una combinacion de estos problemas:

- archivos dispersos en correos, carpetas compartidas o chats
- falta de claridad sobre quien debe actuar sobre cada documento y que personas estan asignadas
- ausencia de trazabilidad sobre cambios, revisiones y aprobaciones
- permisos informales o inseguros
- dificultad para encontrar la ultima version valida
- poca visibilidad del estado real de cada documento

## 4. Alcance del sistema

### En alcance

- autenticacion y control de acceso
- gestion de usuarios, roles y permisos
- carga de documentos y nuevas versiones
- metadata configurable por tipo documental
- comentarios y menciones
- asignacion de encargados y personas
- tablero kanban por estados
- historial y auditoria
- dashboard operativo
- gestion de expedientes o carpetas logicas
- notificaciones internas

### Fuera del MVP

- OCR y extraccion automatica de texto
- firma electronica avanzada
- integraciones con ERP, CRM o correo
- reglas complejas de automatizacion
- app movil nativa
- IA para clasificacion automatica

## 5. Propuesta de valor

El sistema debe posicionarse como una herramienta para:

- organizar documentacion critica
- acelerar revisiones y aprobaciones
- reducir perdida de informacion
- dar visibilidad operativa al equipo
- cumplir auditoria y trazabilidad

## 6. Usuarios y roles

### 6.1 Roles globales

#### Admin del sistema

Responsable de la configuracion general.

Puede:

- crear y desactivar usuarios
- definir roles globales
- configurar tipos documentales
- administrar estados y workflows
- ver toda la informacion del sistema
- gestionar permisos excepcionales
- acceder a auditoria completa

#### Jefe de area o coordinador

Responsable de un equipo o unidad operativa.

Puede:

- ver documentos del area
- asignar encargados, personas y revisores
- mover documentos entre estados segun workflow
- aprobar o rechazar si su rol lo permite
- revisar carga de trabajo y vencimientos

#### Encargado de documento

Usuario dueno operativo del documento.

Puede:

- subir documentos y nuevas versiones
- editar metadatos si tiene permiso
- responder observaciones
- mover documentos en estados habilitados
- comentar y mencionar usuarios
- asignar personas al documento
- asignar roles internos a las personas asignadas

#### Revisor o aprobador

Usuario encargado de validar contenido, forma o cumplimiento.

Puede:

- revisar documentos asignados
- comentar y dejar observaciones
- aprobar o rechazar
- solicitar cambios

#### Colaborador

Usuario operativo con acceso limitado.

Puede:

- ver documentos autorizados
- comentar
- cargar documentos si su rol lo permite
- gestionar solo los documentos a los que este asignado o que tenga compartidos

#### Externo o invitado

Usuario con acceso restringido por documento o expediente.

Puede:

- ver documentos compartidos con el
- subir archivos de respuesta si se habilita
- comentar solo en espacios permitidos

#### Auditor o solo lectura

Usuario de control interno o auditoria.

Puede:

- ver documentos, historial y versionado
- no puede editar, comentar ni mover estados salvo excepcion

### 6.2 Asignaciones por documento

Cada documento tendra un conjunto de personas asignadas.

Reglas base:

- cada documento tendra un unico `encargado`
- el creador del documento queda como `encargado` inicial por defecto
- el encargado puede agregar o quitar personas asignadas
- el encargado puede asignar roles internos sobre el documento
- un usuario puede estar asignado a varios documentos
- los revisores y aprobadores deben estar asignados al documento

Roles internos sugeridos:

- `encargado`
- `editor`
- `revisor`
- `aprobador`
- `participante`
- `lector`

### 6.3 Permisos por documento

Cada documento tendra ACL propia. Un usuario puede tener permisos adicionales o menores que su rol global.

Permisos sugeridos:

- `view`
- `comment`
- `download`
- `edit_metadata`
- `upload_version`
- `move_state`
- `approve`
- `manage_permissions`
- `delete`
- `share`

### 6.4 Reglas de permisos

- El creador del documento sera propietario inicial y encargado inicial.
- El admin puede reasignar propietario o encargado.
- El encargado administra las personas asignadas al documento salvo restriccion superior.
- Un documento puede tener multiples revisores y aprobadores, siempre entre las personas asignadas.
- Los permisos pueden ser permanentes o con fecha de expiracion.
- Los permisos pueden heredarse desde expediente o definirse de forma individual.
- Todo cambio de permiso queda auditado.

## 7. Entidades principales

### Documento

Archivo principal con metadata y contexto operativo.

Campos clave:

- id
- titulo
- codigo interno
- descripcion
- tipo documental
- estado actual
- nivel de confidencialidad
- propietario
- encargado actual
- personas asignadas
- fecha de creacion
- fecha de vencimiento
- version vigente
- expediente asociado

### Version de documento

Representa cada archivo cargado para un mismo documento.

Campos clave:

- numero de version
- archivo en MinIO
- checksum
- usuario que subio
- fecha
- comentario de version

### Expediente

Agrupador logico de documentos.

Ejemplos:

- cliente
- proyecto
- contrato
- caso
- colaborador

### Asignacion documental

Relacion operativa entre un documento y una persona asignada.

Campos clave:

- documento
- usuario
- rol interno
- asignado por
- fecha de asignacion
- estado de la asignacion

### Comentario

Conversacion asociada a documento o version.

Campos clave:

- autor
- texto
- menciones
- adjuntos opcionales
- estado de lectura

### Actividad

Evento auditable del sistema.

Ejemplos:

- documento creado
- version cargada
- estado cambiado
- personas asignadas actualizadas
- permiso otorgado
- comentario agregado
- aprobacion o rechazo

## 8. Workflow documental

### 8.1 Estados base

Estados iniciales propuestos:

- `Borrador`
- `Pendiente de revision`
- `En revision`
- `Observado`
- `Aprobado`
- `Rechazado`
- `Archivado`

### 8.2 Significado de cada estado

#### Borrador

Documento recien creado o aun incompleto.

#### Pendiente de revision

Documento listo para ser tomado por un revisor.

#### En revision

Documento actualmente evaluado por uno o mas revisores.

#### Observado

Documento con correcciones requeridas.

#### Aprobado

Documento validado y apto para uso formal.

#### Rechazado

Documento descartado o no conforme.

#### Archivado

Documento finalizado, inactivo o cerrado.

### 8.3 Reglas de transicion

- `Borrador -> Pendiente de revision`: requiere archivo cargado y metadatos minimos completos.
- `Pendiente de revision -> En revision`: la toma un revisor o coordinador.
- `En revision -> Observado`: requiere comentario obligatorio.
- `En revision -> Aprobado`: solo revisor o aprobador habilitado.
- `Observado -> Pendiente de revision`: requiere nueva version o respuesta del encargado.
- `Aprobado -> Archivado`: lo puede ejecutar encargado, coordinador o admin.
- `Aprobado -> Borrador`: no permitido; debe generarse nueva version o nuevo documento.
- `Cualquier estado -> Rechazado`: solo roles habilitados y con motivo obligatorio.

### 8.4 Vista kanban

El tablero principal mostrara columnas por estado. Cada tarjeta deberia incluir:

- nombre del documento
- tipo
- encargado
- cantidad de personas asignadas
- prioridad
- fecha limite
- ultima actividad
- cantidad de comentarios
- version actual
- etiqueta de confidencialidad

## 9. Modulos funcionales

### 9.1 Autenticacion y acceso

- login con email y contrasena
- JWT con expiracion y refresh
- recuperacion de contrasena
- bloqueo por intentos fallidos

### 9.2 Dashboard

- documentos por estado
- documentos por encargado
- personas asignadas por documento
- pendientes por aprobar
- vencimientos proximos
- actividad reciente

### 9.3 Gestion documental

- crear documento
- cargar archivo
- editar metadata
- subir nuevas versiones
- descargar segun permiso
- archivar
- definir encargado y personas asignadas

### 9.4 Kanban documental

- ver documentos por estado
- mover entre columnas segun permisos
- filtrar por area, tipo, encargado, persona asignada o prioridad

### 9.5 Asignaciones documentales

- asignar encargado
- agregar personas al documento
- quitar personas del documento
- asignar rol interno por persona

### 9.6 Comentarios y colaboracion

- comentar en documento o version
- mencionar usuarios
- marcar comentarios resueltos
- registrar lectura

### 9.7 Permisos y comparticion

- compartir con usuarios y roles
- dar y quitar permisos
- definir expiracion
- herencia desde expediente

### 9.8 Auditoria

- historial cronologico por documento
- historial de permisos
- historial de cambios de estado
- historial de versiones

### 9.9 Administracion

- usuarios
- roles
- tipos documentales
- flujos
- configuracion base

## 10. MVP

### 10.1 Objetivo del MVP

Validar que el sistema permite gestionar documentos como unidades operativas con trazabilidad real.

### 10.2 Alcance del MVP

Incluye:

- autenticacion
- gestion basica de usuarios
- roles globales basicos
- carga de documentos
- almacenamiento en MinIO
- metadata minima
- tablero kanban por estado
- asignacion de encargado
- personas asignadas por documento
- comentarios
- permisos por documento
- historial de actividad
- versionado basico
- filtros y busqueda simple

### 10.3 No incluye en MVP

- workflows por tipo muy complejos
- OCR
- firma digital
- automatizaciones avanzadas
- integraciones externas
- notificaciones por multiples canales

### 10.4 Definicion de exito del MVP

El MVP sera exitoso si un equipo puede:

- iniciar sesion
- crear un documento
- asignar encargado
- asignar personas al documento
- moverlo entre estados
- comentar observaciones
- otorgar y quitar permisos
- subir nueva version
- revisar historial completo

## 11. Roadmap por fases

### Fase 0 - Fundacion tecnica

- repositorio y estructura de proyectos
- autenticacion
- base de datos
- almacenamiento de archivos
- modelos base
- docker compose local

### Fase 1 - MVP operativo

- dashboard inicial
- CRUD documental
- kanban por estados
- asignaciones documentales
- comentarios
- permisos por documento
- versionado basico
- auditoria

### Fase 2 - Operacion ampliada

- expedientes
- notificaciones
- vencimientos
- checklist por documento
- tareas asociadas
- aprobaciones mas robustas

### Fase 3 - Escalamiento

- OCR
- full text search
- automatizaciones
- reporteria
- integraciones externas

## 12. Historias de usuario clave del MVP

### Autenticacion

- Como usuario quiero iniciar sesion para acceder a la plataforma segun mis permisos.
- Como admin quiero crear usuarios para habilitar acceso al equipo.

### Gestion documental

- Como encargado quiero subir un documento para iniciar su ciclo de trabajo.
- Como encargado quiero asignar personas al documento para coordinar su ejecucion.
- Como usuario quiero editar metadatos para clasificar correctamente un documento.
- Como usuario quiero subir una nueva version para corregir observaciones sin perder trazabilidad.

### Workflow

- Como coordinador quiero mover un documento entre estados para reflejar su situacion real.
- Como revisor quiero aprobar o rechazar un documento para cerrar una revision formal.
- Como revisor quiero dejar una observacion obligatoria al rechazar o observar un documento.

### Asignaciones

- Como encargado quiero asignar personas al documento para organizar su ejecucion.
- Como encargado quiero definir roles internos a las personas asignadas para ordenar responsabilidades.

### Colaboracion

- Como usuario quiero comentar un documento para colaborar sin usar correo externo.
- Como usuario quiero mencionar a otro usuario para pedir accion o respuesta.

### Permisos

- Como propietario quiero dar acceso a otro usuario para que pueda revisar o comentar.
- Como propietario quiero quitar acceso a un usuario para proteger informacion sensible.

### Trazabilidad

- Como auditor quiero ver el historial del documento para saber quien hizo cada cambio.
- Como usuario quiero ver la version vigente para evitar trabajar sobre archivos obsoletos.

## 13. Priorizacion MoSCoW

### Must have

- login
- usuarios y roles basicos
- carga de archivos
- metadata minima
- versionado basico
- kanban por estados
- personas asignadas por documento
- comentarios
- permisos por documento
- historial de actividad

### Should have

- expedientes
- notificaciones internas
- vencimientos
- checklist
- dashboard con metricas

### Could have

- enlaces compartidos con expiracion
- favoritos
- plantillas de metadata por tipo
- tareas por documento

### Won't have por ahora

- OCR
- firma digital
- IA de clasificacion
- integraciones externas

## 14. Requisitos no funcionales

- interfaz web responsive
- tiempos de carga razonables para listas y tablero
- auditoria de acciones sensibles
- seguridad por JWT y hash de contrasenas
- almacenamiento desacoplado en MinIO
- backups de base de datos y objetos
- logs y metricas para observabilidad

## 15. KPIs sugeridos

- cantidad de documentos creados por semana
- tiempo promedio de aprobacion
- cantidad de documentos observados
- cantidad de versiones por documento
- vencimientos proximos no gestionados
- porcentaje de documentos archivados dentro de plazo

## 16. Arquitectura objetivo

El sistema debera implementarse con arquitectura de microservicios. Para que el MVP siga siendo viable, la separacion inicial debe ser corta y clara, evitando partir en demasiados servicios pequenos desde el dia uno.

### 16.1 Principios

- cada servicio tiene responsabilidad de negocio clara
- cada servicio es desplegable de forma independiente
- cada servicio es duenio de sus datos
- la comunicacion inicial puede ser REST sincrona
- los eventos asincronos pueden incorporarse en una fase posterior

### 16.2 Microservicios propuestos para el MVP

#### API Gateway

Responsable de exponer una entrada unica al frontend.

Funciones:

- enrutar requests a servicios internos
- validar autenticacion basica
- centralizar politicas de CORS
- servir como borde para versionado de API

#### Auth Service

Responsable de identidad y acceso global.

Funciones:

- login
- refresh token
- usuarios
- roles globales
- hash de contrasenas
- emision y validacion de JWT

#### Document Service

Responsable del dominio principal documental.

Funciones:

- crear documento
- editar metadata
- gestionar tipos documentales
- gestionar expedientes
- versionado
- referencias a archivos

#### Workflow Service

Responsable del kanban y ciclo de vida.

Funciones:

- estados
- transiciones
- asignacion de encargados
- asignaciones de personas a documentos
- aprobacion y rechazo
- historial de estados

#### Collaboration Service

Responsable de interacciones de usuario sobre documentos.

Funciones:

- comentarios
- menciones
- notificaciones internas
- permisos por documento
- bitacora de actividad si se decide centralizar aqui

#### File Service

Responsable de almacenamiento fisico.

Funciones:

- carga y descarga de archivos
- integracion con MinIO
- validacion de tipo y tamano
- gestion de buckets y claves de objeto

### 16.3 Servicios fuera del MVP

Estos servicios pueden quedar para una fase posterior:

- audit-service dedicado
- search-service con OCR y full text
- notification-service multicanal
- reporting-service

## 17. Implicancias tecnicas para tu stack

### Frontend

React + Vite + TypeScript para:

- dashboard
- tabla documental
- tablero kanban
- formularios de carga y edicion
- pantalla de detalle con comentarios e historial
- consumo del API Gateway

### Backend

FastAPI como base de los microservicios:

- `api-gateway`
- `auth-service`
- `document-service`
- `workflow-service`
- `collaboration-service`
- `file-service`

### Base de datos

PostgreSQL como motor comun, pero con propiedad de datos por servicio.

Estrategia recomendada para el MVP:

- una sola instancia de PostgreSQL
- una base o schema separado por servicio
- sin acceso cruzado directo entre tablas de distintos servicios

### Almacenamiento

MinIO para:

- archivos principales
- nuevas versiones
- adjuntos de comentarios

## 18. Modelo inicial de datos por servicio

### Auth Service

- `users`
- `roles`
- `user_roles`
- `refresh_tokens`

### Document Service

- `documents`
- `document_versions`
- `document_types`
- `expedients`

### Workflow Service

- `document_states`
- `document_state_history`
- `document_assignments`
- `document_assignment_roles`

### Collaboration Service

- `document_permissions`
- `comments`
- `comment_mentions`
- `notifications`
- `activities`

### File Service

- `stored_files`
- `file_uploads`

## 19. Supuestos de negocio

- Un documento tiene un unico encargado vigente.
- Un documento puede tener multiples personas asignadas.
- Un documento siempre tiene un estado vigente.
- Todo cambio de estado genera evento auditable.
- Los permisos por documento prevalecen sobre configuraciones generales del modulo.
- Una nueva version no elimina las anteriores.
- Un rechazo o una observacion requiere motivo.

## 20. Riesgos principales

- intentar cubrir demasiados workflows desde el inicio
- sobrecargar el MVP con automatizaciones avanzadas
- mezclar permisos globales y permisos por documento sin reglas claras
- no definir bien el modelo de estados y transiciones
- no registrar auditoria desde la primera version
- fragmentar demasiado pronto la arquitectura y bloquear el avance del MVP
- permitir dependencias directas entre bases de datos de distintos servicios

## 21. Recomendacion de arranque

Empieza por este orden:

1. contratos entre microservicios y ownership de datos
2. `api-gateway` y `auth-service`
3. `document-service` y `file-service`
4. `workflow-service`
5. `collaboration-service`
6. frontend con login, dashboard, tabla, kanban y detalle
7. endurecimiento con testing, Docker y monitoreo
