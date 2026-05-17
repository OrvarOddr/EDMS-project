# Skill: Cerrar PR

Usa esta skill cuando haya cambios listos y el usuario quiera commit, push, PR y merge.

## Flujo

1. Revisar `git status --short`.
2. Confirmar rama actual.
3. Ejecutar validaciones razonables.
4. Stagear solo archivos relacionados con la tarea.
5. Commit en español:
   - `feat: ...`
   - `fix: ...`
   - `docs: ...`
   - `chore: ...`
6. Push de la rama.
7. Crear PR hacia `develop`.
8. Si CI está verde y no hay conflictos, mergear.
9. Confirmar que quedó en `develop`.

## Reglas

- No stagear `.env`.
- No stagear `.claude/` ni artefactos de docs si no son parte de la tarea.
- No usar `git reset --hard`.
- No usar `git checkout --` para revertir cambios ajenos.
- Si hay conflictos, resolver manteniendo cambios del usuario y validando después.
- Si CI falla, no inventar dependencias ni tests: leer el error y arreglar lo mínimo.

## Comandos Útiles

```bash
git status --short
git branch --show-current
git add <archivos-relacionados>
git commit -m "fix: descripcion corta"
git push
gh pr create --base develop --head <rama> --title "..." --body "..."
gh pr merge <numero> --merge --delete-branch
```
