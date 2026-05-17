# Skill: Seguridad Del Repo

Usa esta skill para findings, review de seguridad o dudas de permisos.

## Focos Del Proyecto

- JWT:
  - access token y refresh token no son intercambiables.
  - Validar `type=access`, issuer y audience.
- Usuarios:
  - usuarios `inactive`, `blocked` o eliminados no deben operar.
  - nunca devolver hash de contraseña ni refresh token.
- Documentos:
  - validar permisos antes de ver, editar, comentar, mover, borrar o asignar encargado.
  - no permitir operaciones por adivinar `document_id`.
- Archivos:
  - validar dueño/acceso antes de metadata, descarga, papelera, restore o delete definitivo.
  - validar tamaño y MIME.
- Workflow:
  - `workflow-service` es dueño de estado, encargado y asignaciones.
  - debe validar permiso consultando `document-service` cuando una acción depende del actor.
- Collaboration:
  - comentarios deben validar permiso sobre documento.
  - menciones/notificaciones no deben filtrar información de documentos ajenos.

## Reglas De Revisión

- Reportar hallazgos con severidad P0/P1/P2.
- Incluir archivo y línea.
- Distinguir entre bug real, riesgo y mejora.
- Si el usuario pide arreglar, implementar fix mínimo y validar.
