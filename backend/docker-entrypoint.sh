#!/bin/sh
set -e

echo "[entrypoint] Rodando migrations..."
node_modules/.bin/knex --knexfile knexfile.js migrate:latest

echo "[entrypoint] Iniciando servidor..."
exec node dist/server.js
