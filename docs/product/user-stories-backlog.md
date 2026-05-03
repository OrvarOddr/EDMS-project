# Backlog Inicial de Historias de Usuario

## Convenciones

- Prioridad: P0 critica, P1 alta, P2 media, P3 baja
- Sprint sugerido: orientativo para planificacion
- Estado inicial recomendado en Trello: Backlog

Nota:

- este documento contiene solo historias de usuario funcionales
- las tarjetas tecnicas y el texto completo para Trello estan en `docs/planning/trello-card-catalog.md`

## Epic 1 - Autenticacion y acceso

### US-001 Iniciar sesion

Como usuario quiero iniciar sesion con mis credenciales para acceder solo a las funciones permitidas por mi rol.

Criterios de aceptacion:

- dado un usuario activo con credenciales validas, cuando inicia sesion, entonces recibe acceso a la plataforma
- dado un usuario con credenciales invalidas, cuando intenta iniciar sesion, entonces ve mensaje de error
- dado un usuario `inactive` o `blocked`, cuando intenta iniciar sesion, entonces no recibe acceso y ve un mensaje acorde a su estado
- dado un login exitoso, cuando el sistema inicia la sesion, entonces entrega credenciales renovables y el contexto de autorizacion necesario para navegar segun rol
- dado un usuario autenticado, cuando navega la plataforma, entonces solo ve acciones autorizadas

Prioridad: P0
Sprint sugerido: 1

### US-002 Cerrar sesion

Como usuario quiero cerrar sesion para proteger mi acceso cuando termino de usar el sistema.

Criterios de aceptacion:

- dado un usuario autenticado, cuando cierra sesion, entonces su sesion deja de ser valida

Prioridad: P0
Sprint sugerido: 1

### US-003 Crear usuario

Como admin quiero crear usuarios para habilitar acceso al equipo.

Criterios de aceptacion:

- el admin puede crear usuario con nombre, email, rol y estado
- el sistema evita emails duplicados

Prioridad: P0
Sprint sugerido: 1

## Epic 2 - Roles y permisos

### US-004 Asignar rol global

Como admin quiero asignar roles globales para controlar capacidades generales del sistema.

Criterios de aceptacion:

- el admin puede asignar un rol al crear o editar usuario
- los permisos de interfaz y API se ajustan al rol

Prioridad: P0
Sprint sugerido: 1

### US-005 Dar permisos por documento

Como usuario con permiso `manage_permissions` quiero otorgar permisos especificos a otro usuario para colaborar en un documento.

Criterios de aceptacion:

- se puede otorgar `view`, `comment`, `download`, `edit_metadata`, `upload_version`, `move_state`, `approve` y `manage_permissions`
- el cambio queda registrado en historial

Prioridad: P0
Sprint sugerido: 2

### US-006 Quitar permisos por documento

Como usuario con permiso `manage_permissions` quiero quitar permisos para proteger informacion sensible o cerrar acceso cuando ya no se necesita.

Criterios de aceptacion:

- se puede revocar uno o varios permisos
- el usuario pierde acceso inmediatamente
- la revocacion queda auditada

Prioridad: P0
Sprint sugerido: 2

### US-007 Permisos con expiracion

Como usuario con permiso `manage_permissions` quiero dar acceso temporal para evitar compartir informacion de forma indefinida.

Criterios de aceptacion:

- se puede definir fecha y hora de expiracion
- al vencer, el permiso queda inactivo sin intervencion manual

Prioridad: P2
Sprint sugerido: 4

## Epic 3 - Gestion documental

### US-008 Crear documento

Como usuario quiero crear un documento para iniciar su ciclo de trabajo.

Criterios de aceptacion:

- se puede ingresar titulo, tipo documental, descripcion y expediente opcional
- el sistema registra creador y fecha
- el documento queda disponible para asociar archivo y continuar el flujo documental

Prioridad: P0
Sprint sugerido: 1

### US-009 Cargar archivo

Como usuario quiero adjuntar el archivo principal del documento para almacenarlo y gestionarlo.

Criterios de aceptacion:

- el sistema valida tipo y tamano
- el archivo se almacena en MinIO
- PostgreSQL guarda metadata y referencia al objeto

Prioridad: P0
Sprint sugerido: 1

### US-010 Editar metadata

Como usuario con permiso quiero editar metadata para clasificar correctamente el documento.

Criterios de aceptacion:

- se pueden editar campos habilitados
- el cambio queda registrado en actividad

Prioridad: P0
Sprint sugerido: 2

### US-011 Ver detalle base de documento

Como usuario quiero abrir un documento y ver su detalle base para trabajar con el archivo y la metadata sin salir de la plataforma.

Criterios de aceptacion:

- el detalle muestra archivo o acceso de descarga
- el detalle muestra metadata principal, tipo documental, expediente y version vigente si existe
- solo se muestran acciones permitidas al usuario

Prioridad: P0
Sprint sugerido: 2

### US-012 Subir nueva version

Como encargado quiero subir una nueva version para responder observaciones sin perder historial.

Criterios de aceptacion:

- la nueva version incrementa numeracion
- la version anterior se conserva
- la actividad registra quien subio y cuando

Prioridad: P0
Sprint sugerido: 2

## Epic 4 - Workflow y kanban

### US-013 Ver tablero kanban

Como usuario quiero ver los documentos agrupados por estado para entender la carga operativa.

Criterios de aceptacion:

- el tablero muestra columnas por estado
- cada tarjeta muestra titulo, encargado, personas asignadas, prioridad, fecha y version
- el usuario solo ve documentos autorizados

Prioridad: P0
Sprint sugerido: 2

### US-014 Mover documento entre estados

Como usuario con permiso quiero mover un documento entre estados para reflejar su progreso.

Criterios de aceptacion:

- el sistema valida transiciones permitidas
- el cambio actualiza el estado actual
- el cambio genera evento en historial

Prioridad: P0
Sprint sugerido: 2

### US-015 Observar documento

Como revisor quiero enviar un documento a `Observado` con comentarios para solicitar correcciones.

Criterios de aceptacion:

- el comentario de observacion es obligatorio
- el encargado recibe notificacion interna

Prioridad: P0
Sprint sugerido: 3

### US-016 Aprobar documento

Como aprobador quiero aprobar un documento para dejarlo formalmente validado.

Criterios de aceptacion:

- solo roles habilitados pueden aprobar
- el estado cambia a `Aprobado`
- la accion queda auditada

Prioridad: P0
Sprint sugerido: 3

### US-017 Rechazar documento

Como aprobador quiero rechazar un documento con motivo para cerrar el flujo de revision cuando no corresponde aprobar.

Criterios de aceptacion:

- el motivo es obligatorio
- el estado cambia a `Rechazado`
- el rechazo queda visible en historial

Prioridad: P1
Sprint sugerido: 3

## Epic 5 - Asignaciones documentales

### US-018 Asignar encargado de documento

Como coordinador quiero asignar un encargado para dejar claro quien lidera el documento.

Criterios de aceptacion:

- el documento tiene un unico encargado vigente
- la asignacion queda visible en tarjeta y detalle
- el cambio genera notificacion interna

Prioridad: P0
Sprint sugerido: 2

### US-019 Gestionar personas asignadas del documento

Como encargado quiero gestionar las personas asignadas del documento para coordinar su ejecucion.

Criterios de aceptacion:

- se pueden agregar una o varias personas al documento
- cada persona queda asociada al documento con fecha y usuario que la asigno
- cada persona asignada puede tener un rol interno como editor, revisor, aprobador, participante o lector
- se puede quitar una persona asignada del documento
- el detalle muestra encargado y personas asignadas
- el detalle muestra rol interno de cada persona asignada
- el cambio impacta su acceso segun reglas del sistema
- la baja y las modificaciones quedan auditadas
- la vista respeta permisos del usuario autenticado

Prioridad: P0
Sprint sugerido: 2

## Epic 6 - Comentarios y colaboracion

### US-020 Comentar documento

Como usuario con permiso quiero comentar un documento para colaborar dentro de la plataforma.

Criterios de aceptacion:

- el comentario queda asociado al documento o version
- el sistema muestra autor y fecha

Prioridad: P0
Sprint sugerido: 2

### US-021 Mencionar usuario

Como usuario quiero mencionar a otro usuario para pedir accion sobre un documento.

Criterios de aceptacion:

- el sistema detecta menciones tipo `@usuario`
- el usuario mencionado recibe notificacion interna

Prioridad: P1
Sprint sugerido: 3

### US-022 Marcar comentario resuelto

Como encargado quiero marcar una observacion como resuelta para ordenar la conversacion.

Criterios de aceptacion:

- un comentario puede cambiar a estado resuelto
- la resolucion queda visible en la conversacion

Prioridad: P2
Sprint sugerido: 4

## Epic 7 - Busqueda y filtros

### US-023 Buscar documentos

Como usuario quiero buscar documentos por nombre o codigo para encontrarlos rapido.

Criterios de aceptacion:

- la busqueda devuelve solo documentos autorizados
- se puede buscar por titulo y codigo

Prioridad: P0
Sprint sugerido: 2

### US-024 Filtrar documentos

Como usuario quiero filtrar documentos por tipo, estado, encargado, persona asignada o fecha para trabajar mejor.

Criterios de aceptacion:

- se pueden combinar filtros
- la tabla y el kanban reflejan el resultado filtrado

Prioridad: P0
Sprint sugerido: 2

## Epic 8 - Historial y auditoria

### US-025 Ver historial de actividad

Como auditor quiero revisar todas las acciones de un documento para tener trazabilidad completa.

Criterios de aceptacion:

- el historial muestra accion, actor, fecha y contexto
- incluye cambios de estado, permisos, versiones y comentarios

Prioridad: P0
Sprint sugerido: 2

### US-026 Ver historial de versiones

Como usuario quiero ver las versiones anteriores para entender la evolucion del documento.

Criterios de aceptacion:

- el detalle lista versiones con fecha, autor y comentario
- la version vigente queda identificada

Prioridad: P0
Sprint sugerido: 2

## Epic 9 - Dashboard

### US-027 Ver metricas principales

Como coordinador quiero ver metricas de documentos y pendientes para tomar decisiones operativas.

Criterios de aceptacion:

- el dashboard muestra documentos por estado
- muestra pendientes de revision y vencimientos proximos

Prioridad: P1
Sprint sugerido: 3

### US-028 Ver actividad reciente

Como usuario quiero ver actividad reciente para enterarme rapido de cambios relevantes.

Criterios de aceptacion:

- el dashboard muestra eventos recientes relacionados con mis documentos o accesos

Prioridad: P1
Sprint sugerido: 3

## Epic 10 - Expedientes

### US-029 Crear expediente

Como usuario autorizado quiero crear un expediente para agrupar documentos relacionados.

Criterios de aceptacion:

- un expediente puede tener nombre, codigo y descripcion
- un documento puede asociarse a un expediente

Prioridad: P1
Sprint sugerido: 4

### US-030 Ver expediente

Como usuario quiero abrir un expediente y ver todos sus documentos asociados.

Criterios de aceptacion:

- el expediente muestra lista y cantidad de documentos
- se respetan permisos por documento

Prioridad: P1
Sprint sugerido: 4

## Epic 11 - Notificaciones

### US-031 Recibir notificacion por asignacion

Como usuario quiero recibir notificacion cuando me asignan un documento para no depender de avisos externos.

Criterios de aceptacion:

- el sistema genera notificacion interna al asignar encargado, persona o revisor

Prioridad: P1
Sprint sugerido: 3

### US-032 Recibir notificacion por comentario o mencion

Como usuario quiero enterarme cuando comentan o me mencionan en un documento relevante.

Criterios de aceptacion:

- se generan notificaciones internas por comentario y mencion

Prioridad: P1
Sprint sugerido: 3

## Epic 12 - Vencimientos y control

### US-033 Registrar fecha de vencimiento

Como encargado quiero definir fecha limite o vencimiento para priorizar gestion documental.

Criterios de aceptacion:

- un documento puede tener fecha de vencimiento opcional
- la fecha se muestra en tabla, detalle y kanban

Prioridad: P1
Sprint sugerido: 4

### US-034 Ver vencimientos proximos

Como coordinador quiero ver documentos proximos a vencer para actuar a tiempo.

Criterios de aceptacion:

- el dashboard y filtros permiten identificar proximos vencimientos

Prioridad: P1
Sprint sugerido: 4

## Epic 13 - Papelera de archivos

### US-036 Gestionar papelera de archivos

Como usuario quiero enviar archivos a la papelera, restaurarlos y eliminarlos permanentemente para gestionar el ciclo de vida de los archivos subidos.

Criterios de aceptacion:

- el usuario puede enviar un archivo a la papelera sin eliminarlo fisicamente
- los archivos en papelera no aparecen en la vista de archivos sin asignar
- el usuario puede restaurar un archivo individual desde la papelera
- el usuario puede restaurar archivos seleccionados o todos a la vez
- el usuario puede eliminar permanentemente un archivo individual; el objeto se borra de MinIO y los registros de DB
- el usuario puede eliminar permanentemente archivos seleccionados o vaciar toda la papelera
- la vista de papelera muestra solo los archivos del usuario autenticado
- se puede seleccionar multiples archivos para acciones masivas

Prioridad: P1
Sprint sugerido: 2
Estado: Done

### US-037 Visualizar almacenamiento disponible

Como usuario quiero ver cuanto espacio estoy usando y cuanto tengo disponible para gestionar mis archivos dentro del limite asignado.

Criterios de aceptacion:

- el dashboard muestra un card con GB usados y porcentaje del total
- el sidebar muestra una barra de progreso con `usado / total GB`
- el calculo de espacio usado refleja solo archivos activos del usuario (excluye papelera)
- el total se determina por la cuota configurada en el servidor (`STORAGE_QUOTA_GB`)
- los valores se actualizan automaticamente al subir un archivo, eliminar permanentemente o vaciar la papelera
- cambiar `STORAGE_QUOTA_GB` en el `.env` actualiza el total sin modificar codigo

Prioridad: P1
Sprint sugerido: 3
Estado: Done

## Epic 15 - Etiquetas

### US-035 Gestionar etiquetas de documentos

Como usuario quiero crear, editar y eliminar etiquetas, y asignarlas a documentos para facilitar su clasificacion y filtrado.

Criterios de aceptacion:

- el usuario puede crear una etiqueta con nombre y color
- el usuario puede editar nombre y color de una etiqueta existente
- el usuario puede eliminar una etiqueta; sus asociaciones con documentos se eliminan en cascada
- las etiquetas se persisten en base de datos y se cargan desde la API
- se puede asignar una o varias etiquetas a un documento
- se puede quitar una etiqueta de un documento
- el sidebar muestra las etiquetas disponibles y permite filtrar documentos por etiqueta
- los documentos muestran sus etiquetas como chips de color en la vista de lista y detalle

Prioridad: P1
Sprint sugerido: 4
Estado: Done

## Orden sugerido de implementacion

### Sprint 1

- US-001
- US-002
- US-003
- US-004
- US-008
- US-009

### Sprint 2

- US-005
- US-006
- US-010
- US-011
- US-012
- US-013
- US-014
- US-018
- US-019
- US-020
- US-023
- US-024
- US-025
- US-026

### Sprint 3

- US-015
- US-016
- US-017
- US-021
- US-027
- US-028
- US-031
- US-032

### Sprint 4

- US-007
- US-022
- US-029
- US-030
- US-033
- US-034

## Tarjetas iniciales para Trello

Columnas sugeridas:

- Backlog
- To Do
- In Progress
- Testing
- Done

Etiquetas sugeridas:

- Frontend
- Backend
- Base de datos
- Seguridad
- UX
- DevOps
- P0
- P1
- P2
