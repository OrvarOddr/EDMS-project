# Stack Tecnológico

## Estado del documento

Este archivo describe el stack objetivo del proyecto reiniciado.
No debe leerse como “ya implementado”, sino como referencia base para la nueva construcción.

## Gestión del proyecto

| Herramienta | Uso | Estado |
|---|---|---|
| **Trello** | Planificación, backlog y seguimiento de tareas | Planificado |
| **Figma** | Diseño de interfaces y prototipos | Planificado |
| **Notion** | Documentación técnica y decisiones de arquitectura | Planificado |

## Entorno de desarrollo

| Herramienta | Uso | Estado |
|---|---|---|
| **Visual Studio Code** | IDE principal | Propuesto |
| **Colima** | Runtime de Docker en macOS (reemplaza Docker Desktop) | Propuesto |

## Control de versiones

| Herramienta | Uso | Estado |
|---|---|---|
| **Git** | Control de versiones | Implementado |
| **GitHub** | Repositorio remoto | Implementado |

**Estrategia de ramas:**
- `main` — producción
- `develop` — integración
- `feature/*` — nuevas funcionalidades

## Frontend

| Herramienta | Uso | Estado |
|---|---|---|
| **React** | Librería UI | Propuesto |
| **Vite** | Bundler y entorno de desarrollo | Propuesto |
| **TypeScript** | Tipado estático | Propuesto |
| **Tailwind CSS v4** | Estilos | Propuesto |
| **React Router** | Navegación | Propuesto |
| **Axios** | Cliente HTTP | Propuesto |
| **ESLint** | Linting | Propuesto |
| **Prettier** | Formateo de código | Propuesto |
| **Vitest + React Testing Library** | Testing | Pendiente |

## Backend

| Herramienta | Uso | Estado |
|---|---|---|
| **FastAPI** | Framework REST | Propuesto |
| **SQLAlchemy** | ORM | Propuesto |
| **Pydantic** | Validación de datos | Propuesto |
| **Alembic** | Migraciones de base de datos | Pendiente |
| **Black** | Formateo de código Python | Propuesto |
| **Ruff** | Linting Python | Propuesto |
| **Pytest** | Testing | Pendiente |
| **Postman** | Pruebas de API | Planificado |

## Base de datos y almacenamiento

| Herramienta | Uso | Estado |
|---|---|---|
| **PostgreSQL 16** | Base de datos relacional (usuarios, documentos, metadatos) | Propuesto |
| **MinIO** | Almacenamiento de archivos binarios (PDFs, imágenes) | Propuesto |

## Infraestructura y despliegue

| Herramienta | Uso | Estado |
|---|---|---|
| **Docker** | Contenerización de servicios | Propuesto |
| **Docker Compose** | Orquestación local y en servidor | Propuesto |
| **Nginx** | Reverse proxy, enrutamiento por puerto único | Propuesto |
| **GitHub Actions** | CI con lint, type-check y build automatizado | Propuesto |

## Monitoreo y seguridad

| Herramienta | Uso | Estado |
|---|---|---|
| **Prometheus** | Recolección de métricas | Pendiente |
| **Grafana** | Visualización de métricas | Pendiente |
| **JWT** | Autenticación | Propuesto |
| **bcrypt** | Hash de contraseñas | Propuesto |
