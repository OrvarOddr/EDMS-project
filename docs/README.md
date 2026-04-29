# Documentación del Proyecto

Este directorio contiene la base funcional y técnica del proyecto `EDMS`.

## Punto de partida

Si vas a retomar el proyecto desde cero, empieza por estos documentos y en este orden:

1. [foundation/PROJECT-FOUNDATION.md](foundation/PROJECT-FOUNDATION.md)
2. [product/product-blueprint.md](product/product-blueprint.md)
3. [domain/domain-model-and-bounded-contexts.md](domain/domain-model-and-bounded-contexts.md)
4. [architecture/contracts-and-service-ownership.md](architecture/contracts-and-service-ownership.md)
5. [architecture/database-schemas-by-service.md](architecture/database-schemas-by-service.md)
6. [product/user-stories-backlog.md](product/user-stories-backlog.md)

## Bloques de trabajo

### Bloque 1. Dominio

Documentos de cierre:

1. [foundation/PROJECT-FOUNDATION.md](foundation/PROJECT-FOUNDATION.md)
2. [domain/domain-model-and-bounded-contexts.md](domain/domain-model-and-bounded-contexts.md)
3. [domain/document-assignments-and-internal-roles-model.md](domain/document-assignments-and-internal-roles-model.md)

Salida esperada:

- bounded contexts oficiales
- entidades oficiales por contexto
- reglas base del negocio
- distinciones entre propietario documental, encargado, asignacion, rol interno y permiso documental
- modelo conceptual de encargado y personas asignadas

Cuando estos tres documentos quedan consistentes entre si, el Bloque 1 se considera cerrado.

### Bloque 2. Ownership y contratos

Documentos de trabajo:

1. [architecture/contracts-and-service-ownership.md](architecture/contracts-and-service-ownership.md)
2. [architecture/database-schemas-by-service.md](architecture/database-schemas-by-service.md)

Salida esperada:

- cada microservicio tiene ownership funcional claro
- cada entidad principal tiene un duenio unico
- las fronteras entre servicios quedan documentadas
- las integraciones entre servicios quedan definidas a nivel conceptual
- no quedan zonas grises entre documentos, asignaciones, comentarios, permisos y archivos

El Bloque 2 se considera cerrado cuando estos dos documentos quedan consistentes con:

- [foundation/PROJECT-FOUNDATION.md](foundation/PROJECT-FOUNDATION.md)
- [domain/domain-model-and-bounded-contexts.md](domain/domain-model-and-bounded-contexts.md)

### Bloque 3. Modelo relacional por servicio

Documentos de trabajo:

1. [data/auth-service-der.md](data/auth-service-der.md)
2. [data/document-service-der.md](data/document-service-der.md)
3. [data/file-service-der.md](data/file-service-der.md)
4. [data/workflow-service-der.md](data/workflow-service-der.md)
5. [data/collaboration-service-der.md](data/collaboration-service-der.md)

## Estructura recomendada de lectura

### 1. Producto

- [foundation/PROJECT-FOUNDATION.md](foundation/PROJECT-FOUNDATION.md)
- [product/product-blueprint.md](product/product-blueprint.md)
- [product/user-stories-backlog.md](product/user-stories-backlog.md)

### 2. Dominio

- [domain/domain-model-and-bounded-contexts.md](domain/domain-model-and-bounded-contexts.md)
- [domain/document-assignments-and-internal-roles-model.md](domain/document-assignments-and-internal-roles-model.md)

### 3. Arquitectura

- [architecture/microservices-architecture.md](architecture/microservices-architecture.md)
- [architecture/contracts-and-service-ownership.md](architecture/contracts-and-service-ownership.md)
- [architecture/database-schemas-by-service.md](architecture/database-schemas-by-service.md)
- [architecture/architecture-diagrams.md](architecture/architecture-diagrams.md)

### 4. Datos

- [data/auth-service-der.md](data/auth-service-der.md)
- [data/document-service-der.md](data/document-service-der.md)
- [data/file-service-der.md](data/file-service-der.md)
- [data/workflow-service-der.md](data/workflow-service-der.md)
- [data/collaboration-service-der.md](data/collaboration-service-der.md)

### 5. Gestión del trabajo

- [planning/stack.md](planning/stack.md)
- [planning/team-git-workflow.md](planning/team-git-workflow.md)
- [planning/trello-board-setup.md](planning/trello-board-setup.md)
- [planning/trello-card-catalog.md](planning/trello-card-catalog.md)

## Qué documentos son fuente principal

Los documentos principales para arrancar el proyecto nuevo son:

- `foundation/PROJECT-FOUNDATION.md`
- `product/product-blueprint.md`
- `domain/domain-model-and-bounded-contexts.md`
- `architecture/contracts-and-service-ownership.md`
- `architecture/database-schemas-by-service.md`
- `product/user-stories-backlog.md`

Los demás documentos deben leerse como apoyo o como diseño detallado.
