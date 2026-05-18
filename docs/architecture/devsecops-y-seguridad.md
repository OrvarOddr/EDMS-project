# DevSecOps y Seguridad

## 1. Objetivo

Dejar el pipeline con seguridad integrada ("Sec" de DevSecOps): que cada
cambio se escanee automaticamente y que no se pueda desplegar codigo con
problemas. La seguridad no es una etapa final, es parte de CI.

## 2. Capas de seguridad en CI (`.github/workflows/ci.yml`)

Cada push y pull request a `main`/`develop` ejecuta:

| Control | Herramienta | Alcance |
|---|---|---|
| Escaneo de secretos | gitleaks | Todo el repo, con allowlist acotado para credenciales ficticias de tests |
| SAST (analisis estatico) | Bandit | `services/<svc>/app` de los 6 servicios, severidad media+ |
| Dependencias backend | pip-audit | `requirements.txt` por servicio (matriz, `fail-fast: false`) |
| Dependencias frontend | npm audit | `frontend/`, nivel `high` |
| Vulnerabilidades de filesystem | Trivy | Repo completo, `HIGH,CRITICAL`, `ignore-unfixed` |
| Lint backend | ruff | 6 servicios |
| Lint frontend | eslint | `frontend/` |
| Dockerfiles | hadolint | Todos los `Dockerfile` |

## 3. Gestion de dependencias (Dependabot)

`.github/dependabot.yml` abre PRs semanales para:

- `pip` en cada uno de los 6 servicios
- `npm` en `frontend/`
- `github-actions` en la raiz

Asi las actualizaciones de seguridad llegan como PRs revisables en vez de
acumularse como deuda.

## 4. Hallazgos reales corregidos

Durante el montaje, los escaneres y tests detectaron problemas reales que
se arreglaron en su origen:

- **Bug de colision de refresh tokens** (auth-service): dos refresh tokens
  del mismo usuario emitidos en el mismo segundo colisionaban en
  `token_hash`. Se agrego un claim `jti` unico a los JWT. Lo destapo un
  test de integracion nuevo.
- **`python-multipart` 0.0.26 → 0.0.27** (file-service): CVE-2026-42561,
  fix directo aplicado.
- **Frontend**: `npm audit fix` dejo el arbol de dependencias en
  **0 vulnerabilidades** (solo cambio el lockfile; build y tests siguen
  verdes).
- **Falsos positivos de escaneres**: afinados de forma acotada y
  documentada (allowlist de gitleaks solo para fixtures de test;
  `.trivyignore` por ID).

## 5. Vulnerabilidades aceptadas temporalmente

Tres CVE quedan ignoradas a proposito porque su remediacion exige subir
un framework que esta topado por pines transitivos. Estan documentadas en
`.trivyignore` y en los `--ignore-vuln` de pip-audit:

| CVE | Paquete | Fix | Bloqueado por |
|---|---|---|---|
| CVE-2024-47874 | starlette | 0.40.0 | `fastapi==0.115.0` exige `starlette<0.39` |
| CVE-2025-54121 | starlette | 0.47.2 | idem |
| CVE-2026-30922 | pyasn1 | 0.6.3 | `python-jose==3.4.0` exige `pyasn1<0.5.0` |

Cualquier CVE **nueva o distinta** sigue rompiendo CI. Dependabot abrira
los PRs de upgrade de `fastapi`/`python-jose`; al mergearlos hay que
**quitar esos IDs** de `.trivyignore` y de `ci.yml`.

## 6. Gate de despliegue (`.github/workflows/cd.yml`)

El deploy ya no se dispara en cada push a `develop`. Ahora usa
`on: workflow_run` sobre el workflow **CI** y solo despliega si:

```
github.event.workflow_run.conclusion == 'success'
```

Es decir: **no se despliega si CI (tests + seguridad) esta en rojo**.

Caveat: `workflow_run` lee la definicion del workflow desde la rama por
defecto del repositorio. El gate sera plenamente efectivo cuando la rama
por defecto sea `develop`.

## 7. Red de seguridad de tests

La parte "Dev" que respalda lo anterior: los 6 servicios tienen tests
unitarios e integracion (Postgres en CI, llamadas entre servicios
mockeadas con `respx`), el frontend tiene tests con Vitest, y hay un E2E
con Playwright que levanta el stack completo y valida el flujo
frontend → nginx → api-gateway → auth-service → postgres. Esto es lo que
permite subir dependencias por seguridad con confianza.
