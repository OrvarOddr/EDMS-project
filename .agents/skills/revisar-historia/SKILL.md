# Skill: Revisar Historia De Usuario

Usa esta skill cuando el usuario pregunte si una US “cumple”, “está lista” o pida revisar contra Trello/checklist.

## Objetivo

Comparar la implementación real contra los checks de la historia, no contra suposiciones.

## Pasos

1. Identificar la US y su checklist desde la imagen o documentación.
2. Buscar implementación real con `rg`.
3. Revisar frontend, API gateway y servicios involucrados.
4. Separar resultado en:
   - Implementado
   - Parcial
   - Falta
   - No verificable sin probar en entorno/servidor
5. Si hay fallos importantes, proponer o implementar arreglo según lo que pidió el usuario.

## Criterio

- “Se ve en UI” no basta si no persiste.
- “Existe endpoint” no basta si no valida permisos.
- “Existe botón” no basta si no actualiza listas/detalle/kanban.
- Si el backend usa hardcode o datos mock donde debería usar base real, marcarlo como parcial o fallo.

## Respuesta Esperada

Responder corto y claro:

```text
Sí cumple X/Y.
Implementado: ...
Falta: ...
Riesgo: ...
```

Si el usuario pidió arreglar, no quedarse solo en diagnóstico: implementar.
