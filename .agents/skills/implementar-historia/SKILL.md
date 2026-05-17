# Skill: Implementar Historia De Usuario

Usa esta skill cuando el usuario pida implementar una US del backlog/Trello.

## Objetivo

Implementar la historia completa respetando arquitectura de microservicios, checklist documental, UI actual, seguridad y flujo Git del proyecto.

## Pasos

1. Leer contexto mínimo:
   - `docs/planning/MASTER-IMPLEMENTATION-CHECKLIST.md`
   - `docs/product/user-stories-backlog.md`
   - archivos del servicio o frontend relacionados.
2. Confirmar ownership:
   - metadata/documentos/tags: `document-service`
   - estado/encargado/asignaciones: `workflow-service`
   - archivos/MinIO/papelera: `file-service`
   - comentarios/menciones/notificaciones: `collaboration-service`
   - login/usuarios/roles globales: `auth-service`
   - routing/autorización externa: `api-gateway`
3. Crear rama si corresponde:
   - `feature/us-XXX-nombre-corto`
   - `fix/us-XXX-nombre-corto`
4. Implementar backend primero cuando exista contrato nuevo.
5. Implementar frontend después, usando datos reales de API.
6. Actualizar estado local de UI tras mutaciones.
7. Validar permisos y casos de error.
8. Ejecutar validaciones razonables:
   - `npm run lint`
   - `npm run build`
   - `python3 -m compileall ...`
   - tests existentes solo si aplican.
9. Commit/push/PR/merge si el usuario lo espera o si la tarea quedó lista.

## Reglas Importantes

- No usar datos falsos en filtros/listas si existe backend real.
- No agregar campos al servicio incorrecto.
- No mezclar estado workflow con metadata documental.
- No crear tests o infraestructura que el usuario no pidió.
- No tocar archivos no relacionados.
- Mantener commits en español y scope corto.

## Checklist De Cierre

Antes de responder, indicar:

- qué se implementó;
- qué validaciones pasaron;
- rama/PR/merge si aplica;
- qué quedó fuera o qué depende de otra historia.
