# Arquitectura de Microservicios para el MVP

## 1. Objetivo

Separar el sistema en microservicios reales sin destruir la velocidad del MVP. La meta no es tener muchos servicios, sino pocos servicios bien delimitados.

## 2. Mapa inicial de servicios

### API Gateway

Responsabilidad:

- punto de entrada unico para el frontend
- autenticacion basica de borde
- routing hacia servicios internos

Endpoints orientativos:

- `/api/auth/*`
- `/api/documents/*`
- `/api/workflows/*`
- `/api/collaboration/*`
- `/api/files/*`

### Auth Service

Responsabilidad:

- usuarios
- roles globales
- login y refresh
- JWT

Persistencia del MVP:

- schema `auth`

### Document Service

Responsabilidad:

- documentos
- metadata
- tipos documentales
- expedientes
- versionado logico

Persistencia del MVP:

- schema `documents`

### Workflow Service

Responsabilidad:

- estados
- transiciones
- encargado del documento
- asignaciones de personas a documentos
- revisores
- historial de cambio de estado

Persistencia del MVP:

- schema `workflow`

### Collaboration Service

Responsabilidad:

- permisos por documento
- comentarios
- menciones
- notificaciones internas
- actividad

Persistencia del MVP:

- schema `collaboration`

### File Service

Responsabilidad:

- upload
- download
- validaciones de archivo
- referencia a MinIO

Persistencia del MVP:

- schema `files`

Infraestructura:

- MinIO

## 3. Flujo objetivo del sistema

1. El usuario inicia sesion por `api-gateway`.
2. `api-gateway` deriva a `auth-service`.
3. El frontend crea un documento a traves de `document-service`.
4. El archivo se carga via `file-service`.
5. `document-service` registra la version y referencia del archivo.
6. `workflow-service` asigna estado inicial `Borrador`, encargado y personas al documento.
7. `collaboration-service` gestiona permisos, comentarios y notificaciones.

## 4. Reglas de diseno

- El frontend nunca habla directo con la base de datos.
- Un servicio no lee tablas de otro servicio.
- La integracion entre servicios se hace por HTTP interno en el MVP.
- Los IDs entre servicios deben poder correlacionarse de forma estable.
- La auditoria fuente debe pertenecer a cada servicio duenio de la accion; una timeline consolidada puede construirse despues como proyeccion.

## 5. Stack minimo local

Servicios para `docker-compose`:

- frontend
- api-gateway
- auth-service
- document-service
- workflow-service
- collaboration-service
- file-service
- postgres
- minio

## 6. Decision practica para el MVP

Para no sobredisenar:

- usa una sola instancia de PostgreSQL
- usa `schemas` aislados por servicio dentro de esa instancia
- usa REST interno
- deja mensajeria asincrona para fase posterior

## 7. Riesgos a controlar

- duplicar logica de permisos entre servicios
- duplicar logica de asignaciones y permisos entre workflow-service y collaboration-service
- acoplar workflow y documentos en la misma base por comodidad
- meter comentarios dentro de `document-service`
- crear un gateway demasiado inteligente
- partir con mas microservicios de los necesarios

## 8. Primer corte tecnico

El primer corte que deberia quedar funcionando es:

- `api-gateway`
- `auth-service`
- `document-service`
- `file-service`
- frontend

Con eso ya puedes:

- iniciar sesion
- crear documento
- subir archivo
- listar documentos
- ver detalle documental base

Despues agregas:

- `workflow-service`
- `collaboration-service`

Nota:

- aunque `workflow-service` entre justo despues de este primer corte, las reglas de dominio para `Borrador` y `encargado` inicial ya quedan cerradas desde el comienzo
- la integracion inmediata siguiente debe materializar esas reglas en el flujo de creacion documental

## 9. Convencion de repositorio sugerida

```text
frontend/
services/
  api-gateway/
  auth-service/
  document-service/
  workflow-service/
  collaboration-service/
  file-service/
infra/
  docker/
docs/
```
