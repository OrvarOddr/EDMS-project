#!/bin/sh
set -eu

require_secret() {
  name="$1"
  value="$(eval "printf '%s' \"\${$name:-}\"")"
  if [ -z "$value" ]; then
    echo "Variable requerida no definida: $name" >&2
    exit 1
  fi
  if [ "${#value}" -lt 12 ]; then
    echo "Variable $name debe tener al menos 12 caracteres" >&2
    exit 1
  fi
  case "$value" in
    cambia_esto|generar_un_valor_fuerte|password|admin|admin123)
      echo "Variable $name no puede usar un valor por defecto o debil" >&2
      exit 1
      ;;
  esac
}

escape_sql() {
  printf "%s" "$1" | sed "s/'/''/g"
}

ensure_role_schema() {
  role="$1"
  password="$2"
  schema="$3"
  escaped_password="$(escape_sql "$password")"

  psql -v ON_ERROR_STOP=1 -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$role') THEN
    CREATE ROLE $role LOGIN PASSWORD '$escaped_password';
  ELSE
    ALTER ROLE $role WITH PASSWORD '$escaped_password';
  END IF;
END
\$\$;

CREATE SCHEMA IF NOT EXISTS $schema AUTHORIZATION $role;
ALTER SCHEMA $schema OWNER TO $role;
GRANT USAGE, CREATE ON SCHEMA $schema TO $role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA $schema TO $role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA $schema TO $role;
ALTER DEFAULT PRIVILEGES IN SCHEMA $schema GRANT ALL ON TABLES TO $role;
ALTER DEFAULT PRIVILEGES IN SCHEMA $schema GRANT ALL ON SEQUENCES TO $role;
SQL
}

require_secret POSTGRES_PASSWORD
require_secret AUTH_DB_PASSWORD
require_secret DOCUMENTS_DB_PASSWORD
require_secret WORKFLOW_DB_PASSWORD
require_secret COLLABORATION_DB_PASSWORD
require_secret FILES_DB_PASSWORD

export PGPASSWORD="$POSTGRES_PASSWORD"
export POSTGRES_USER="${POSTGRES_USER:-postgres}"
export POSTGRES_DB="${POSTGRES_DB:-edms}"

ensure_role_schema "edms_auth" "$AUTH_DB_PASSWORD" "auth"
ensure_role_schema "edms_documents" "$DOCUMENTS_DB_PASSWORD" "documents"
ensure_role_schema "edms_workflow" "$WORKFLOW_DB_PASSWORD" "workflow"
ensure_role_schema "edms_collaboration" "$COLLABORATION_DB_PASSWORD" "collaboration"
ensure_role_schema "edms_files" "$FILES_DB_PASSWORD" "files"
