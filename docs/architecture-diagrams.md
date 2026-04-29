# Diagramas de Arquitectura y Dominio

## Objetivo

Definir los diagramas base del proyecto con un nivel profesional, versionables en Git y faciles de mantener por el equipo.

## Herramienta recomendada

Usaremos `Mermaid` dentro de archivos Markdown porque:

- se versiona junto con el proyecto
- se puede revisar por PR
- GitHub lo renderiza
- evita depender de herramientas visuales cerradas para cambios pequenos

## Regla de modelado

Vamos a construir los diagramas por capas:

1. contexto del sistema
2. microservicios y relaciones
3. modelo conceptual de dominio
4. despues, DER por servicio

No se mezclan todos los niveles en un solo diagrama.

## Convenciones visuales

- usa nombres de dominio claros y estables
- usa nombres de entidad consistentes con schemas y contratos
- evita poner demasiados atributos en diagramas conceptuales
- muestra ownership y relaciones, no implementacion detallada
- un diagrama debe responder una pregunta concreta
- si un diagrama queda muy cargado, se divide

## 1. Diagrama de contexto del sistema

Pregunta que responde:

- quien usa la plataforma y que sistemas externos intervienen

```mermaid
flowchart LR
    subgraph Actors[Actores]
        User[Usuario Interno]
        Admin[Administrador]
        Reviewer[Revisor o Aprobador]
    end

    subgraph Platform[Plataforma]
        Frontend[Frontend Web]
        Gateway[API Gateway]

        Auth[Auth Service]
        Documents[Document Service]
        Workflow[Workflow Service]
        Collaboration[Collaboration Service]
        Files[File Service]
    end

    subgraph Storage[Persistencia]
        Postgres[(PostgreSQL)]
        MinIO[(MinIO)]
    end

    User --> Frontend
    Admin --> Frontend
    Reviewer --> Frontend

    Frontend --> Gateway

    Gateway --> Auth
    Gateway --> Documents
    Gateway --> Workflow
    Gateway --> Collaboration
    Gateway --> Files

    Auth --> Postgres
    Documents --> Postgres
    Workflow --> Postgres
    Collaboration --> Postgres
    Files --> Postgres
    Files --> MinIO
```

## 2. Diagrama de microservicios y ownership

Pregunta que responde:

- que hace cada servicio y donde vive la fuente de verdad

```mermaid
flowchart LR
    Gateway[API Gateway]

    Auth["Auth Service
    users
    roles
    refresh_tokens"]

    Documents["Document Service
    documents
    document_types
    document_versions
    expedients"]

    Workflow["Workflow Service
    document_states
    document_assignments
    assignment_roles
    state_history"]

    Collaboration["Collaboration Service
    comments
    mentions
    document_permissions
    notifications
    activities"]

    Files["File Service
    stored_files
    file_uploads"]

    Gateway --> Auth
    Gateway --> Documents
    Gateway --> Workflow
    Gateway --> Collaboration
    Gateway --> Files

    Workflow -. valida document_id .-> Documents
    Documents -. referencia file_id .-> Files
    Workflow -. emite cambios de estado y asignacion .-> Collaboration
    Collaboration -. consulta contexto minimo .-> Workflow
```

## 3. Diagrama conceptual de dominio

Pregunta que responde:

- cuales son las entidades principales del negocio y como se relacionan

```mermaid
classDiagram
    class User
    class Role
    class Document
    class DocumentType
    class Expedient
    class DocumentVersion
    class DocumentState
    class StateTransition
    class StateHistory
    class DocumentAssignment
    class AssignmentRole
    class Comment
    class Mention
    class DocumentPermission
    class Notification
    class Activity
    class StoredFile

    Role "many" -- "many" User : global roles

    DocumentType "1" --> "many" Document : classifies
    Expedient "1" --> "many" Document : groups
    Document "1" --> "many" DocumentVersion : has
    Document "1" --> "many" StateHistory : records
    Document "1" --> "many" DocumentAssignment : assigns
    Document "1" --> "many" Comment : contains
    Document "1" --> "many" DocumentPermission : grants
    Document "many" --> "1" DocumentState : current state
    StateTransition "many" --> "1" DocumentState : from
    StateTransition "many" --> "1" DocumentState : to

    User "1" --> "many" DocumentAssignment : participates
    AssignmentRole "1" --> "many" DocumentAssignment : defines

    User "1" --> "many" Comment : writes
    Comment "1" --> "many" Mention : includes
    User "1" --> "many" Mention : is mentioned

    User "1" --> "many" DocumentPermission : receives
    User "1" --> "many" Notification : receives
    User "1" --> "many" Activity : performs

    DocumentVersion "1" --> "1" StoredFile : stored as
```

## 4. Diagrama conceptual de asignaciones documentales

Pregunta que responde:

- como se modela el encargado y las personas asignadas

```mermaid
classDiagram
    class Document
    class User
    class DocumentAssignment {
      uuid id
      uuid document_id
      uuid user_id
      uuid assignment_role_id
      uuid assigned_by_user_id
      uuid removed_by_user_id
      bool is_active
      datetime assigned_at
      datetime removed_at
    }
    class AssignmentRole {
      uuid id
      string code
      string name
    }

    Document "1" --> "many" DocumentAssignment : has
    User "1" --> "many" DocumentAssignment : is assigned
    AssignmentRole "1" --> "many" DocumentAssignment : uses

    note for DocumentAssignment "El encargado se modela como una asignacion con rol interno 'encargado'. Solo puede existir una asignacion activa con ese rol por documento. Los campos assigned_by_user_id y removed_by_user_id mantienen trazabilidad."
```

## 5. Orden correcto para producir diagramas futuros

Despues de estos diagramas, el siguiente orden es:

1. DER de `auth-service`
2. DER de `document-service`
3. DER de `workflow-service`
4. DER de `collaboration-service`
5. DER de `file-service`

## 6. Regla de calidad

Antes de dar un diagrama por cerrado, revisa:

- si el nombre de cada entidad coincide con el lenguaje del proyecto
- si no mezcla ownership entre servicios
- si no repite detalle tecnico innecesario
- si el equipo puede usarlo para tomar decisiones

## 7. Recomendacion practica para el equipo

- mantengan este archivo como fuente oficial de diagramas base
- si un diagrama cambia una regla de negocio, actualicen tambien el documento funcional relacionado
- no hagan diagramas solo para presentacion; deben servir para tomar decisiones tecnicas
