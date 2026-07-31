#!/bin/sh
set -e

# Ensure the data dir (SQLite DB + uploads) exists and is owned by the app user.
mkdir -p "${UPLOAD_DIR:-/data/uploads}"
chown -R node:node /data

# If a command was passed, run that instead of the server — this is what makes
#   docker compose run --rm quidly npm run set-password
# work. Deliberately skips migrate/seed so one-shot commands don't touch the
# database.
if [ "$#" -gt 0 ]; then
  exec gosu node "$@"
fi

echo "Quidly: applying database migrations..."
gosu node npx prisma migrate deploy

echo "Quidly: seeding categories..."
gosu node npx prisma db seed

echo "Quidly: starting on http://0.0.0.0:3000"
exec gosu node npx next start -H 0.0.0.0 -p 3000
