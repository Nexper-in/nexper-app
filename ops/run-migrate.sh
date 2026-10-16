#!/usr/bin/env bash
# Runs tools/migrate.mjs the way the release workflow needs it.
#   ops/run-migrate.sh [--dry-run]
# Needs DATABASE_URL (session pooler string). If DATABASE_CA_PEM holds the Supabase
# certificate authority (Database settings, "SSL certificate") the server is verified;
# without it the connection is still encrypted but the server is not verified, and the
# run says so in a visible warning.
set -euo pipefail
args=("$@")
if [ -n "${DATABASE_CA_PEM:-}" ]; then
  printf '%s\n' "$DATABASE_CA_PEM" > "${RUNNER_TEMP:-/tmp}/db-ca.crt"
  export DATABASE_CA="${RUNNER_TEMP:-/tmp}/db-ca.crt"
else
  echo "::warning::DATABASE_CA_PEM is not set: the database server certificate is not being verified. Add the Supabase CA as a secret (docs/RELEASE.md)."
  args+=("--no-verify-ssl")
fi
node tools/migrate.mjs "${args[@]}"
