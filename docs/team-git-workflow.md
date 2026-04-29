# Flujo de Trabajo Git y Ramas

## Objetivo

Definir una forma consistente de trabajar en equipo con Trello, GitHub y ramas para que las tarjetas, commits y pull requests sigan una misma regla.

## Reglas base

- `main` es la rama estable y protegida.
- `develop` es la rama de integracion.
- el trabajo diario sale desde `develop`.
- no se trabaja directo en `main`.
- no se trabaja directo en `develop` salvo integraciones muy puntuales y acordadas.
- toda tarjeta importante debe quedar asociada a una rama.
- toda decision tecnica relevante debe quedar escrita en `docs/`.

## Regla de ramas por tarjeta

### Caso 1. Una tarjeta aislada

Usa una rama por tarjeta cuando:

- la tarjeta es independiente
- el cambio no depende de otras decisiones abiertas
- el alcance esta acotado

Ejemplo:

- `feature/auth-service-base`
- `feature/document-service-base`
- `feature/docker-compose`

### Caso 2. Varias tarjetas del mismo bloque

Usa una sola rama para varias tarjetas cuando:

- forman parte del mismo bloque de trabajo
- comparten el mismo contexto tecnico
- separar ramas te haria duplicar trabajo o abrir PRs artificiales

Ejemplo valido:

- `feature/domain-model`
  - definir modelo de dominio global y bounded contexts
  - definir contratos y ownership entre microservicios
  - definir bases o schemas por servicio
  - diseñar modelo de asignaciones documentales y roles internos

## Regla practica para este proyecto

Por ahora:

- las tarjetas de arquitectura y modelado pueden vivir juntas en `feature/domain-model`
- cuando termines ese bloque, haces PR a `develop`
- despues creas ramas nuevas por bloque tecnico

Ejemplo siguiente:

- `feature/auth-service-base`
- `feature/document-service-base`
- `feature/file-service-base`
- `feature/frontend-base`

## Flujo correcto de trabajo

### 1. Antes de empezar una tarjeta

Sincroniza `develop`:

```bash
git checkout develop
git pull
```

### 2. Crear una rama nueva

Si la tarjeta requiere rama nueva:

```bash
git checkout -b feature/nombre-corto
```

Ejemplos:

```bash
git checkout -b feature/domain-model
git checkout -b feature/auth-service-base
git checkout -b feature/document-service-base
```

### 3. Trabajar una tarjeta dentro de una rama existente

Si sigues en el mismo bloque:

```bash
git checkout feature/domain-model
git pull
```

Nota:

- si la rama aun no existe en remoto, `git pull` puede no ser necesario
- no cambies de rama solo porque cerraste una tarjeta si la siguiente pertenece al mismo bloque

### 4. Guardar avance

```bash
git add .
git commit -m "docs: define domain model and service ownership"
git push -u origin feature/domain-model
```

Despues del primer push puedes usar:

```bash
git push
```

## Regla de commits

- un commit debe representar una unidad coherente de trabajo
- no mezclar cambios de arquitectura con cambios de frontend en el mismo commit sin necesidad
- usa mensajes claros y cortos

Formato sugerido:

- `docs: ...`
- `feat: ...`
- `fix: ...`
- `chore: ...`

Ejemplos:

```bash
git commit -m "docs: define domain model and bounded contexts"
git commit -m "docs: define contracts and service ownership"
git commit -m "chore: create initial project structure"
```

## Regla de pull requests

Haz PR hacia `develop` cuando:

- terminaste un bloque coherente
- el contenido ya puede ser revisado por el equipo
- no necesitas seguir acumulando trabajo no relacionado en la misma rama

Ejemplo para este momento:

- termina primero el bloque de arquitectura y modelado
- luego abre PR de `feature/domain-model` hacia `develop`

## Regla de Trello y Git

- una tarjeta en `In Progress` debe tener una persona a cargo
- una tarjeta importante debe poder asociarse a una rama
- una rama puede cubrir varias tarjetas solo si pertenecen al mismo bloque
- cuando cierres una tarjeta, deja comentario con el archivo o decision tomada
- cuando cierres una rama, referencia el PR en las tarjetas relacionadas

## Secuencia recomendada para trabajar una tarjeta

1. mover tarjeta a `In Progress`
2. confirmar si ira en rama nueva o en la rama actual
3. trabajar el archivo o codigo correspondiente
4. hacer commit
5. hacer push
6. dejar comentario en Trello
7. mover tarjeta a `Testing` o `Done` segun el tipo de trabajo

## Cuando pasar a Testing y cuando pasar a Done

### Pasa a `Testing`

Cuando:

- el trabajo necesita revision tecnica
- hay algo que validar funcionalmente
- hay codigo ejecutable o integracion que probar

### Pasa a `Done`

Cuando:

- la tarjeta es documental y ya quedo aceptada
- o la funcionalidad ya fue validada

## Comandos utiles del dia a dia

### Ver ramas

```bash
git branch
git branch -a
```

### Ver estado

```bash
git status
```

### Ver cambios

```bash
git diff
```

### Cambiar de rama

```bash
git checkout develop
git checkout feature/domain-model
```

### Crear rama desde develop

```bash
git checkout develop
git pull
git checkout -b feature/nombre-corto
```

### Subir rama nueva

```bash
git push -u origin feature/nombre-corto
```

## Regla para no enredarse

Si te haces esta pregunta:

- "debo cambiar de rama ahora?"

Responde asi:

- si la siguiente tarjeta sigue el mismo tema tecnico, no
- si la siguiente tarjeta abre otro bloque distinto, si

## Regla actual para ti

En este momento:

- sigue trabajando en `feature/domain-model`
- no vuelvas a `develop` todavia
- cierra primero el bloque de arquitectura y modelado
- despues haces PR hacia `develop`
