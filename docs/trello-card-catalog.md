# Catalogo de Tarjetas de Trello

## Objetivo

Este documento contiene el texto base de las tarjetas que se definieron para el arranque del proyecto.

Reglas:

- las tarjetas tecnicas conviven con historias de usuario
- este catalogo sirve para poblar descripciones, checklist y definicion de terminado en Trello
- el backlog funcional oficial sigue estando en `user-stories-backlog.md`
- la estructura del tablero y el orden maestro siguen estando en `trello-board-setup.md`

## Tarjetas tecnicas

### 1. [P0] [Arquitectura] Definir modelo de dominio global y bounded contexts

Descripcion:
Definir el mapa global del negocio y separar el sistema en contextos bien delimitados para evitar mezclar responsabilidades entre microservicios.

Checklist:

- Identificar las entidades principales del negocio
- Definir los bounded contexts iniciales del sistema
- Separar las entidades por contexto funcional
- Definir que cada documento tiene un unico encargado
- Definir que un documento puede tener multiples personas asignadas
- Definir que cada persona asignada puede tener un rol interno sobre el documento
- Marcar relaciones conceptuales entre contextos
- Dejar el mapa del dominio listo para pasar al ownership y al modelo relacional

Definicion de terminado:

- Existe una lista clara de bounded contexts
- Cada entidad principal tiene un contexto definido
- La regla de encargado y personas asignadas ya esta cerrada
- El equipo puede pasar a contratos y ownership entre microservicios

### 2. [P0] [Arquitectura] Definir contratos y ownership entre microservicios

Descripcion:
Definir que datos, procesos y endpoints pertenecen a cada microservicio para evitar acoplamiento indebido y cruces de responsabilidad.

Checklist:

- Definir que auth-service es duenio de usuarios, roles y tokens
- Definir que document-service es duenio de documentos, versiones, tipos documentales y expedientes
- Definir que workflow-service es duenio de estados, encargado del documento, personas asignadas y roles internos de asignacion
- Definir que collaboration-service es duenio de comentarios, menciones, notificaciones, permisos y actividad
- Definir que file-service es duenio de uploads, downloads y referencias fisicas a archivos
- Definir que servicio expone cada operacion al resto
- Definir reglas para integraciones entre servicios por HTTP interno
- Definir que ningun servicio puede leer tablas de otro servicio
- Dejar documentadas las fronteras para evitar duplicacion de logica

Definicion de terminado:

- Cada microservicio tiene responsabilidad funcional clara
- Cada entidad tiene un duenio unico
- Los contratos entre servicios estan claros a nivel conceptual
- No quedan zonas grises sobre quien administra documentos, asignaciones, comentarios o archivos

### 3. [P0] [Base de datos] Definir bases o schemas por servicio

Descripcion:
Diseñar la separacion de datos por microservicio usando una sola instancia de PostgreSQL, pero con aislamiento claro entre dominios.

Checklist:

- Definir si se usara una base por servicio o schemas por servicio
- Definir estructura para auth-service
- Definir estructura para document-service
- Definir estructura para workflow-service
- Definir estructura para collaboration-service
- Definir estructura para file-service
- Documentar que no existiran FK cruzadas entre servicios
- Definir IDs de referencia entre servicios a nivel logico
- Definir convencion de nombres por servicio
- Dejar estrategia lista para migraciones independientes

Definicion de terminado:

- Existe una estrategia clara de aislamiento de datos
- Cada servicio tiene su espacio de persistencia definido
- No hay tablas compartidas entre servicios
- El equipo puede pasar al diseño relacional por servicio

### 4. [P0] [Base de datos] Diseñar modelo de asignaciones documentales y roles internos

Descripcion:
Diseñar el modelo conceptual y relacional para representar el encargado del documento, las personas asignadas y los roles internos asociados a esas asignaciones.

Checklist:

- Definir la regla de un unico encargado vigente por documento
- Definir el modelo de personas asignadas al documento
- Definir los roles internos posibles sobre una asignacion
- Definir si el encargado es una asignacion especial o un campo diferenciado
- Definir altas y bajas de personas asignadas
- Definir trazabilidad de quien asigna y quien desasigna
- Definir relacion entre asignaciones y permisos operativos
- Dejar este modelo listo para incorporarlo al DER de workflow-service

Definicion de terminado:

- Existe un modelo claro de asignaciones documentales
- La regla del encargado unico ya esta resuelta
- Los roles internos sobre asignaciones estan definidos
- El equipo puede pasar al DER de workflow-service sin ambiguedades

### 5. [P0] [Base de datos] Diseñar DER de auth-service

Descripcion:
Diseñar el modelo entidad-relacion del servicio de autenticacion para soportar usuarios, roles y sesiones.

Checklist:

- Definir entidad User
- Definir entidad Role
- Definir relacion UserRole
- Definir entidad RefreshToken
- Definir atributos clave y restricciones
- Definir PK, indices y unicidad
- Definir estados de usuario
- Definir reglas basicas de seguridad de persistencia
- Dejar DER listo para implementacion y migracion inicial

Definicion de terminado:

- Existe un DER claro de auth-service
- Se conocen tablas, relaciones y restricciones
- El servicio esta listo para pasar a migracion inicial

### 6. [P0] [Base de datos] Diseñar DER de document-service

Descripcion:
Diseñar el modelo entidad-relacion del servicio documental para soportar documentos, tipos, expedientes y versiones logicas.

Checklist:

- Definir entidad Document
- Definir entidad DocumentVersion
- Definir entidad DocumentType
- Definir entidad Expedient
- Definir relacion entre documento y expediente
- Definir relacion entre documento y tipo documental
- Definir relacion entre documento y versiones
- Definir atributos clave y restricciones
- Definir PK, indices y reglas de integridad internas
- Dejar claro que las personas asignadas no viven en este servicio
- Dejar DER listo para implementacion y migracion inicial

Definicion de terminado:

- Existe un DER claro de document-service
- Se conocen tablas, relaciones y restricciones
- El limite entre document-service y workflow-service queda claro
- El servicio esta listo para pasar a migracion inicial

### 7. [P0] [Backend] Configurar api-gateway base

Descripcion:
Crear el punto de entrada unico para el frontend y el enrutamiento hacia los servicios internos del sistema.

Checklist:

- Crear proyecto base de api-gateway
- Configurar estructura minima del servicio
- Configurar rutas de entrada para auth, documents, workflows, collaboration y files
- Configurar forwarding hacia servicios internos
- Configurar CORS
- Configurar variables de entorno
- Crear endpoint health
- Definir manejo basico de errores
- Verificar comunicacion con servicios internos

Definicion de terminado:

- El gateway levanta localmente
- Responde health correctamente
- Puede enrutar requests a servicios internos
- Queda listo para ser consumido por el frontend

### 8. [P0] [Backend] Configurar auth-service base

Descripcion:
Crear la base del microservicio de autenticacion para manejar usuarios, roles, credenciales y tokens.

Checklist:

- Crear proyecto base de auth-service
- Configurar conexion a su base o schema
- Crear estructura por modulos
- Crear modelos iniciales de auth
- Configurar hash de contraseñas
- Preparar emision y validacion de JWT
- Crear endpoint POST /login
- Crear endpoint POST /refresh
- Crear endpoint health
- Probar arranque del servicio

Definicion de terminado:

- El servicio levanta sin errores
- Tiene conexion a su persistencia
- Puede autenticar usuarios de prueba
- Esta listo para integrarse con api-gateway

### 9. [P0] [Backend] Configurar document-service base

Descripcion:
Crear la base del microservicio documental para gestionar documentos, tipos, expedientes y versionado logico.

Checklist:

- Crear proyecto base de document-service
- Configurar conexion a su base o schema
- Crear estructura por modulos
- Crear modelos iniciales de documents
- Crear endpoint POST /documents
- Crear endpoint GET /documents
- Crear endpoint GET /documents/{id}
- Preparar soporte para versiones logicas
- Dejar documentado que encargado y personas asignadas se consultaran en workflow-service
- Crear endpoint health
- Probar arranque del servicio

Definicion de terminado:

- El servicio levanta sin errores
- Tiene conexion a su persistencia
- Puede crear y listar documentos
- Esta listo para integrarse con api-gateway, workflow-service y file-service

### 10. [P0] [Backend] Configurar file-service base

Descripcion:
Crear la base del microservicio de archivos para validar, almacenar y entregar archivos fisicos del sistema.

Checklist:

- Crear proyecto base de file-service
- Configurar conexion a su base o schema
- Crear estructura por modulos
- Configurar cliente MinIO
- Crear modelo StoredFile
- Crear modelo FileUpload
- Crear endpoint de upload multipart
- Crear endpoint de descarga por identificador
- Validar tamaño y tipo MIME
- Crear endpoint health

Definicion de terminado:

- El servicio levanta sin errores
- Puede conectarse a MinIO
- Puede subir y registrar archivos
- Esta listo para integrarse con document-service

### 11. [P0] [Frontend] Configurar React + Vite + TypeScript base

Descripcion:
Crear la base del frontend para consumir el api-gateway y soportar el arranque del MVP.

Checklist:

- Crear proyecto React + Vite + TypeScript
- Configurar estructura de carpetas
- Configurar React Router
- Crear layout base
- Configurar cliente HTTP
- Configurar variables de entorno
- Preparar manejo de sesion
- Preparar rutas protegidas
- Preparar tipos para documento, encargado y personas asignadas
- Verificar conexion con api-gateway

Definicion de terminado:

- El frontend levanta localmente
- Tiene layout y rutas base
- Puede consumir el gateway
- Queda listo para implementar login y pantallas iniciales

### 12. [P0] [DevOps] Crear docker-compose con frontend gateway servicios postgres minio

Descripcion:
Levantar el entorno local completo del MVP basado en microservicios.

Checklist:

- Crear docker-compose.yml
- Agregar frontend
- Agregar api-gateway
- Agregar auth-service
- Agregar document-service
- Agregar workflow-service
- Agregar collaboration-service
- Agregar file-service
- Agregar postgres
- Agregar minio
- Configurar volumenes y variables de entorno
- Verificar networking entre contenedores

Definicion de terminado:

- Todo levanta con un comando
- Los servicios se resuelven entre si
- PostgreSQL y MinIO quedan accesibles para los servicios
- El entorno local queda listo para desarrollo

## Tarjetas funcionales

### 13. [P0] [Seguridad] US-001 Iniciar sesion

Descripcion:
Como usuario quiero iniciar sesion con mis credenciales para acceder solo a las funciones permitidas por mi rol.

Checklist:

- Crear pantalla de login en frontend
- Conectar frontend con api-gateway
- Exponer ruta de login en api-gateway
- Implementar autenticacion en auth-service
- Validar credenciales contra users
- Generar JWT y refresh token
- Guardar sesion en frontend
- Proteger rutas privadas
- Mostrar error con credenciales invalidas
- Verificar acceso segun rol del usuario

Definicion de terminado:

- Un usuario valido puede iniciar sesion
- Un usuario invalido recibe error claro
- El frontend guarda la sesion correctamente
- Las rutas protegidas requieren autenticacion
- El login funciona de punta a punta entre frontend, gateway y auth-service

### 14. [P0] [Backend] US-008 Crear documento

Descripcion:
Como usuario quiero crear un documento para iniciar su ciclo de trabajo.

Checklist:

- Crear formulario basico de documento en frontend
- Exponer ruta de creacion en api-gateway
- Implementar POST /documents en document-service
- Validar titulo, tipo documental y descripcion
- Registrar creador y fecha
- Crear documento con estado logico inicial Borrador
- Devolver ID y datos minimos al frontend
- Validar que solo usuarios autenticados puedan crear
- Definir si el creador queda como encargado inicial o si el documento queda pendiente de asignacion
- Verificar que el documento aparezca en listado inicial

Definicion de terminado:

- Un usuario autenticado puede crear un documento
- El documento queda persistido en document-service
- El sistema devuelve el ID del documento creado
- El documento nace en estado Borrador
- Queda definida la regla inicial del encargado
- El flujo funciona de punta a punta entre frontend, gateway y document-service

### 15. [P0] [Backend] US-009 Cargar archivo

Descripcion:
Como usuario quiero adjuntar el archivo principal del documento para almacenarlo y gestionarlo.

Checklist:

- Crear componente de upload en frontend
- Exponer ruta de carga en api-gateway
- Implementar upload multipart en file-service
- Validar tamaño maximo del archivo
- Validar tipo MIME permitido
- Subir archivo a MinIO
- Registrar archivo en file-service
- Enviar referencia del archivo a document-service
- Crear o actualizar version logica del documento
- Verificar que el archivo quede asociado al documento correcto

Definicion de terminado:

- Un usuario autenticado puede subir un archivo real
- El archivo queda almacenado en MinIO
- file-service registra el archivo correctamente
- document-service guarda la referencia y la version asociada
- El flujo funciona de punta a punta entre frontend, gateway, file-service, MinIO y document-service

### 16. [P0] [Backend] US-018 Asignar encargado de documento

Descripcion:
Como coordinador quiero asignar un encargado para dejar claro quien lidera el documento.

Checklist:

- Exponer ruta de asignacion en api-gateway
- Implementar asignacion de encargado en workflow-service
- Validar que el documento tenga un unico encargado vigente
- Validar permisos del usuario que asigna
- Registrar quien realizo la asignacion
- Mostrar el encargado en el detalle del documento
- Mostrar el encargado en la tarjeta kanban
- Generar notificacion interna al nuevo encargado
- Registrar el cambio en historial

Definicion de terminado:

- Un documento puede tener un encargado vigente
- No existen dos encargados activos al mismo tiempo
- La asignacion queda visible en detalle y kanban
- El cambio queda auditado y notificado
- El flujo funciona entre frontend, gateway, workflow-service y collaboration-service

### 17. [P0] [Backend] US-019 Gestionar personas asignadas del documento

Descripcion:
Como encargado quiero gestionar las personas asignadas del documento para coordinar su ejecucion.

Checklist:

- Exponer ruta de asignacion en api-gateway
- Implementar gestion de asignaciones en workflow-service
- Validar permisos del usuario que asigna
- Permitir agregar una o varias personas al documento
- Permitir quitar una persona asignada del documento
- Permitir asignar rol interno a cada persona asignada
- Registrar fecha y usuario que realiza la asignacion
- Evitar duplicar la misma asignacion activa
- Mostrar personas asignadas en el detalle del documento
- Generar notificacion interna a las personas asignadas
- Registrar altas, bajas y cambios en historial

Definicion de terminado:

- Se pueden agregar, quitar y actualizar personas asignadas del documento
- Las personas asignadas quedan visibles en la UI
- Los cambios quedan auditados y notificados
- No se generan duplicados activos
- El flujo funciona entre frontend, gateway, workflow-service y collaboration-service

### 18. [P0] [Frontend] US-013 Ver tablero kanban

Descripcion:
Como usuario quiero ver los documentos agrupados por estado para entender la carga operativa.

Checklist:

- Crear vista kanban por estados
- Cargar documentos desde api-gateway
- Mostrar columnas por estado
- Mostrar tarjeta con titulo del documento
- Mostrar encargado del documento
- Mostrar cantidad de personas asignadas
- Mostrar prioridad, fecha y version
- Respetar permisos del usuario autenticado
- Permitir navegar desde una tarjeta al detalle del documento

Definicion de terminado:

- El tablero muestra documentos agrupados por estado
- Cada tarjeta muestra encargado y personas asignadas
- El usuario solo ve documentos autorizados
- Se puede entrar al detalle desde el kanban

### 19. [P0] [Backend] US-014 Mover documento entre estados

Descripcion:
Como usuario con permiso quiero mover un documento entre estados para reflejar su progreso.

Checklist:

- Exponer ruta de cambio de estado en api-gateway
- Implementar cambio de estado en workflow-service
- Validar transiciones permitidas
- Validar permisos del usuario que ejecuta el cambio
- Actualizar estado actual del documento
- Registrar estado anterior y nuevo estado en historial
- Permitir comentario obligatorio cuando aplique
- Notificar al encargado o personas asignadas cuando corresponda
- Reflejar cambio en kanban y detalle

Definicion de terminado:

- El sistema valida transiciones permitidas
- El estado del documento cambia correctamente
- El historial registra quien hizo el cambio y cuando
- La UI refleja el nuevo estado sin inconsistencias
- El flujo funciona entre frontend, gateway, workflow-service y collaboration-service

### 20. [P0] [Backend] US-010 Editar metadata

Descripcion:
Como usuario con permiso quiero editar metadata para clasificar correctamente el documento.

Checklist:

- Crear formulario de edicion de metadata en frontend
- Exponer ruta de actualizacion en api-gateway
- Implementar actualizacion en document-service
- Validar campos permitidos
- Validar permisos del usuario autenticado
- Registrar cambios relevantes en actividad
- Reflejar cambios en detalle y listados
- Evitar modificar campos que pertenecen a otros servicios como estado o asignaciones

Definicion de terminado:

- Un usuario con permiso puede editar metadata
- Los cambios quedan persistidos en document-service
- La actividad registra la edicion
- La UI muestra la metadata actualizada
- No se mezclan campos de metadata con campos de workflow

### 21. [P0] [Frontend] US-011 Ver detalle de documento

Descripcion:
Como usuario quiero abrir un documento y ver archivo, metadata, estado, encargado, personas asignadas, comentarios e historial.

Checklist:

- Crear pantalla de detalle de documento
- Cargar metadata desde document-service via api-gateway
- Cargar estado y asignaciones desde workflow-service via api-gateway
- Cargar comentarios e historial desde collaboration-service via api-gateway
- Mostrar archivo o acceso de descarga
- Mostrar encargado y personas asignadas
- Mostrar metadata principal
- Mostrar estado actual
- Mostrar comentarios e historial
- Mostrar solo acciones permitidas segun el usuario autenticado

Definicion de terminado:

- El detalle consolida informacion de los servicios necesarios
- El usuario puede ver archivo, metadata, estado, encargado y personas asignadas
- La pantalla respeta permisos
- El documento queda navegable como centro operativo principal

### 22. [P0] [Seguridad] US-005 Dar permisos por documento

Descripcion:
Como propietario quiero otorgar permisos especificos a otro usuario para colaborar en un documento.

Checklist:

- Exponer ruta de permisos en api-gateway
- Implementar otorgamiento de permisos en collaboration-service
- Validar que el usuario que otorga tenga permiso para administrar accesos
- Permitir otorgar view, comment, download, edit_metadata, upload_version, move_state, approve, manage_permissions y share
- Registrar a quien se le otorga el permiso
- Registrar quien realizo el cambio
- Reflejar permisos activos en el detalle del documento
- Generar actividad auditable
- Notificar al usuario cuando corresponda

Definicion de terminado:

- Se pueden otorgar permisos por documento
- Solo usuarios autorizados pueden hacerlo
- El cambio queda visible en la UI
- El cambio queda auditado y disponible para consulta
- El flujo funciona entre frontend, gateway y collaboration-service

### 23. [P0] [Seguridad] US-006 Quitar permisos por documento

Descripcion:
Como propietario quiero quitar permisos por documento para proteger informacion sensible o cerrar acceso cuando ya no se necesita.

Checklist:

- Exponer ruta de revocacion en api-gateway
- Implementar revocacion en collaboration-service
- Validar que el usuario que revoca tenga manage_permissions
- Permitir quitar uno o varios permisos activos
- Revocar acceso efectivo de forma inmediata
- Reflejar permisos actualizados en el detalle del documento
- Registrar quien revoco y cuando
- Generar actividad auditable
- Notificar al usuario afectado cuando corresponda

Definicion de terminado:

- Se pueden quitar permisos activos por documento
- El acceso cambia inmediatamente segun la revocacion
- La UI refleja el nuevo estado de permisos
- La revocacion queda auditada
- El flujo funciona entre frontend, gateway y collaboration-service

### 24. [P0] [Frontend] US-020 Comentar documento

Descripcion:
Como usuario con permiso quiero comentar un documento para colaborar dentro de la plataforma.

Checklist:

- Crear seccion de comentarios en el detalle del documento
- Exponer ruta de comentarios en api-gateway
- Implementar alta de comentarios en collaboration-service
- Validar que el usuario tenga permiso para comentar
- Permitir comentar sobre el documento o una version especifica
- Mostrar autor, fecha y contenido del comentario
- Actualizar la lista de comentarios despues de publicar
- Registrar actividad asociada al comentario
- Preparar soporte para menciones futuras

Definicion de terminado:

- Un usuario con permiso puede comentar un documento
- El comentario queda asociado correctamente
- El detalle muestra autor y fecha
- La UI se actualiza sin inconsistencias
- El flujo funciona entre frontend, gateway y collaboration-service

### 25. [P0] [Backend] US-025 Ver historial de actividad

Descripcion:
Como auditor quiero revisar todas las acciones de un documento para tener trazabilidad completa.

Checklist:

- Exponer ruta de historial en api-gateway
- Implementar consulta de actividad en collaboration-service
- Registrar eventos de permisos, comentarios, asignaciones y cambios relevantes
- Incluir actor, fecha, accion y contexto
- Permitir filtrar por tipo de evento si aplica
- Mostrar historial en orden cronologico
- Validar permisos de acceso al historial
- Reflejar cambios en el detalle del documento

Definicion de terminado:

- El historial muestra acciones relevantes del documento
- Cada evento incluye actor, fecha y contexto
- Solo usuarios autorizados pueden verlo
- La informacion queda disponible de forma consistente en la UI
- El flujo funciona entre frontend, gateway y collaboration-service

### 26. [P0] [Frontend] US-026 Ver historial de versiones

Descripcion:
Como usuario quiero ver las versiones anteriores para entender la evolucion del documento.

Checklist:

- Crear seccion de versiones en el detalle del documento
- Exponer ruta de versiones en api-gateway
- Implementar consulta de versiones en document-service
- Mostrar numero de version, fecha, autor y comentario
- Identificar claramente la version vigente
- Permitir navegar o descargar una version segun permisos
- Reflejar nuevas versiones sin inconsistencias en la UI
- Validar acceso segun permisos del usuario autenticado

Definicion de terminado:

- El detalle lista las versiones del documento
- La version vigente queda identificada
- El usuario puede ver los metadatos de cada version
- La vista respeta permisos
- El flujo funciona entre frontend, gateway y document-service

### 27. [P0] [Backend] US-012 Subir nueva version

Descripcion:
Como encargado quiero subir una nueva version para responder observaciones sin perder historial.

Checklist:

- Crear accion de nueva version en el detalle del documento
- Exponer ruta de nueva version en api-gateway
- Subir archivo nuevo mediante file-service
- Registrar referencia del archivo en document-service
- Incrementar numero de version
- Guardar comentario de version
- Registrar usuario y fecha de carga
- Mantener historial completo de versiones anteriores
- Reflejar la nueva version vigente en detalle y kanban si aplica

Definicion de terminado:

- El encargado puede subir una nueva version del documento
- La numeracion de versiones aumenta correctamente
- Las versiones anteriores se conservan
- La nueva version queda identificada como vigente
- El flujo funciona entre frontend, gateway, file-service y document-service

### 28. [P0] [Backend] US-015 Observar documento

Descripcion:
Como revisor quiero enviar un documento a Observado con comentarios para solicitar correcciones.

Checklist:

- Exponer ruta de observacion en api-gateway
- Implementar cambio a Observado en workflow-service
- Validar que el usuario tenga permiso para observar
- Exigir comentario obligatorio al observar
- Registrar actor, fecha y motivo
- Notificar al encargado del documento
- Reflejar el nuevo estado en kanban y detalle
- Registrar el evento en historial de actividad

Definicion de terminado:

- Un revisor autorizado puede observar un documento
- La observacion exige comentario obligatorio
- El estado cambia correctamente a Observado
- El encargado recibe notificacion
- El cambio queda auditado en workflow e historial

### 29. [P0] [Backend] US-016 Aprobar documento

Descripcion:
Como aprobador quiero aprobar un documento para dejarlo formalmente validado.

Checklist:

- Exponer ruta de aprobacion en api-gateway
- Implementar aprobacion en workflow-service
- Validar que el usuario tenga permiso de approve
- Verificar que la transicion actual permita aprobar
- Registrar actor y fecha de aprobacion
- Cambiar el estado a Aprobado
- Reflejar el cambio en kanban y detalle
- Registrar el evento en historial
- Notificar al encargado y personas asignadas relevantes

Definicion de terminado:

- Solo usuarios autorizados pueden aprobar
- El documento cambia a Aprobado correctamente
- La accion queda auditada
- La UI refleja el nuevo estado sin inconsistencias
- El flujo funciona entre frontend, gateway, workflow-service y collaboration-service

### 30. [P1] [Backend] US-017 Rechazar documento

Descripcion:
Como aprobador quiero rechazar un documento con motivo para cerrar el flujo de revision cuando no corresponde aprobar.

Checklist:

- Exponer ruta de rechazo en api-gateway
- Implementar rechazo en workflow-service
- Validar que el usuario tenga permiso para rechazar
- Exigir motivo obligatorio
- Registrar actor, fecha y motivo
- Cambiar el estado a Rechazado
- Reflejar el cambio en kanban y detalle
- Registrar el evento en historial
- Notificar al encargado y personas asignadas relevantes

Definicion de terminado:

- Solo usuarios autorizados pueden rechazar
- El rechazo exige motivo obligatorio
- El documento cambia a Rechazado correctamente
- La accion queda auditada
- El flujo funciona entre frontend, gateway, workflow-service y collaboration-service

### 31. [P1] [Frontend] US-021 Mencionar usuario

Descripcion:
Como usuario quiero mencionar a otro usuario para pedir accion sobre un documento.

Checklist:

- Permitir escribir menciones tipo @usuario en comentarios
- Detectar menciones en frontend
- Exponer menciones a traves de api-gateway
- Implementar procesamiento de menciones en collaboration-service
- Validar que el usuario mencionado tenga acceso o pueda ser notificado segun reglas del sistema
- Crear notificacion interna para la persona mencionada
- Mostrar la mencion correctamente en la UI
- Registrar el evento en actividad cuando corresponda

Definicion de terminado:

- El sistema detecta menciones tipo @usuario
- La persona mencionada recibe notificacion interna
- La mencion queda asociada al comentario correcto
- La UI muestra la mencion de forma consistente
- El flujo funciona entre frontend, gateway y collaboration-service

### 32. [P1] [Backend] US-031 Recibir notificacion por asignacion

Descripcion:
Como usuario quiero recibir notificacion cuando me asignan a un documento o me nombran encargado para no depender de avisos externos.

Checklist:

- Detectar evento de asignacion de encargado o persona en workflow-service
- Enviar evento o request a collaboration-service
- Crear notificacion interna para el usuario asignado
- Guardar tipo de notificacion, fecha y documento asociado
- Mostrar la notificacion en el frontend
- Marcar notificacion como leida si aplica
- Validar que no se creen notificaciones duplicadas innecesarias
- Reflejar notificaciones nuevas en la UI

Definicion de terminado:

- Un usuario recibe notificacion al ser asignado
- La notificacion queda asociada al documento correcto
- La UI muestra la notificacion correctamente
- No se generan duplicados innecesarios
- El flujo funciona entre workflow-service, collaboration-service y frontend

### 33. [P1] [Backend] US-032 Recibir notificacion por comentario o mencion

Descripcion:
Como usuario quiero enterarme cuando comentan o me mencionan en un documento relevante.

Checklist:

- Detectar nuevo comentario relevante en collaboration-service
- Detectar menciones a usuarios en comentarios
- Crear notificacion interna para las personas afectadas
- Asociar la notificacion al documento y comentario correspondiente
- Evitar duplicaciones innecesarias de notificaciones
- Mostrar las notificaciones en el frontend
- Permitir marcar notificaciones como leidas si aplica
- Reflejar cambios de lectura en la UI

Definicion de terminado:

- El usuario recibe notificacion por comentario o mencion relevante
- La notificacion queda vinculada al documento correcto
- La UI muestra las notificaciones correctamente
- El sistema evita duplicados innecesarios
- El flujo funciona entre collaboration-service y frontend

### 34. [P0] [Frontend] US-024 Filtrar documentos

Descripcion:
Como usuario quiero filtrar documentos por tipo, estado, encargado, persona asignada o fecha para trabajar mejor.

Checklist:

- Crear panel de filtros en tabla o kanban
- Permitir filtrar por tipo documental
- Permitir filtrar por estado
- Permitir filtrar por encargado
- Permitir filtrar por persona asignada
- Permitir filtrar por fecha
- Permitir combinar filtros
- Consumir filtros via api-gateway
- Reflejar el resultado filtrado en tabla y kanban
- Mantener consistencia entre filtros y permisos del usuario

Definicion de terminado:

- Los filtros se pueden combinar
- La lista y el kanban muestran resultados consistentes
- El usuario solo ve documentos autorizados
- La UI responde correctamente a cambios de filtro
- El flujo funciona entre frontend, gateway y servicios consultados

### 35. [P0] [Frontend] US-023 Buscar documentos

Descripcion:
Como usuario quiero buscar documentos por nombre o codigo para encontrarlos rapido.

Checklist:

- Crear campo de busqueda en tabla o vista principal
- Permitir buscar por titulo del documento
- Permitir buscar por codigo interno
- Enviar consulta al backend a traves de api-gateway
- Aplicar permisos del usuario autenticado sobre los resultados
- Mostrar resultados consistentes en tabla y navegacion al detalle
- Manejar estados vacios o sin coincidencias
- Evitar consultas excesivas si aplica debounce

Definicion de terminado:

- El usuario puede buscar por nombre o codigo
- Solo aparecen documentos autorizados
- Los resultados se muestran correctamente en la UI
- La navegacion al detalle funciona desde el resultado de busqueda
- El flujo funciona entre frontend, gateway y servicios consultados

### 36. [P2] [Frontend] US-022 Marcar comentario resuelto

Descripcion:
Como encargado quiero marcar una observacion como resuelta para ordenar la conversacion.

Checklist:

- Mostrar accion de resolver comentario en el detalle del documento
- Validar que el usuario tenga permiso suficiente
- Exponer ruta de resolucion en api-gateway
- Implementar cambio de estado del comentario en collaboration-service
- Registrar quien resolvio y cuando
- Reflejar el nuevo estado del comentario en la UI
- Mantener visible el historial del comentario resuelto
- Registrar actividad relacionada cuando corresponda

Definicion de terminado:

- Un comentario puede marcarse como resuelto
- La UI refleja claramente que el comentario fue resuelto
- La resolucion queda auditada
- El historial del comentario se conserva
- El flujo funciona entre frontend, gateway y collaboration-service

### 37. [P1] [Frontend] US-027 Ver metricas principales

Descripcion:
Como coordinador quiero ver metricas de documentos y pendientes para tomar decisiones operativas.

Checklist:

- Crear vista de dashboard inicial
- Mostrar cantidad de documentos por estado
- Mostrar documentos por encargado
- Mostrar pendientes de revision
- Mostrar vencimientos proximos
- Mostrar total de personas asignadas o carga operativa basica si aplica
- Consumir datos agregados via api-gateway
- Validar que solo usuarios autorizados accedan a metricas
- Reflejar metricas con datos consistentes

Definicion de terminado:

- El dashboard muestra metricas principales del sistema
- Las metricas reflejan datos reales y consistentes
- Solo usuarios autorizados pueden acceder
- La UI presenta informacion clara para coordinacion operativa
- El flujo funciona entre frontend, gateway y servicios agregados

### 38. [P1] [Frontend] US-028 Ver actividad reciente

Descripcion:
Como usuario quiero ver actividad reciente para enterarme rapido de cambios relevantes.

Checklist:

- Crear bloque de actividad reciente en dashboard o inicio
- Consultar actividad relevante via api-gateway
- Mostrar actor, accion, fecha y documento asociado
- Incluir cambios de estado, comentarios, permisos y asignaciones
- Respetar permisos del usuario autenticado
- Ordenar eventos por fecha descendente
- Permitir navegar al documento relacionado
- Manejar estado vacio si no hay actividad

Definicion de terminado:

- El usuario ve actividad reciente relevante
- Los eventos muestran informacion util y consistente
- La vista respeta permisos
- Se puede navegar al documento relacionado
- El flujo funciona entre frontend, gateway y collaboration-service

### 39. [P1] [Backend] US-033 Registrar fecha de vencimiento

Descripcion:
Como encargado quiero definir fecha limite o vencimiento para priorizar gestion documental.

Checklist:

- Agregar campo de fecha de vencimiento en metadata del documento o modelo correspondiente
- Crear formulario o accion para definirla
- Exponer ruta de actualizacion en api-gateway
- Implementar persistencia en document-service
- Validar formato y reglas de fecha
- Reflejar la fecha en detalle, tabla y kanban
- Registrar actividad cuando la fecha se agregue o modifique
- Validar permisos del usuario autenticado

Definicion de terminado:

- Un documento puede tener fecha de vencimiento
- La fecha queda persistida correctamente
- La UI muestra la fecha en las vistas principales
- La accion queda auditada
- El flujo funciona entre frontend, gateway, document-service y collaboration-service

### 40. [P1] [Frontend] US-034 Ver vencimientos proximos

Descripcion:
Como coordinador quiero ver documentos proximos a vencer para actuar a tiempo.

Checklist:

- Crear vista o widget de vencimientos proximos
- Consultar documentos con fecha de vencimiento cercana via api-gateway
- Mostrar encargado, documento y fecha limite
- Permitir navegar al detalle del documento
- Permitir combinar con filtros si aplica
- Respetar permisos del usuario autenticado
- Ordenar por proximidad de vencimiento
- Manejar estado vacio si no hay proximos vencimientos

Definicion de terminado:

- El usuario puede ver documentos proximos a vencer
- La informacion se muestra ordenada y clara
- La vista respeta permisos
- Se puede acceder al documento desde el listado
- El flujo funciona entre frontend, gateway y servicios consultados
