#!/bin/sh
# One-command demo: creates .env with generated secrets (if missing), starts the compose
# stack, and loads the small demo orgs plus one large "bench" tenant for the charts demo.
#
#   ./demo.sh                 # 100,000 readings per series (4 samples x 2 metrics = 800k rows)
#   POINTS=250000 ./demo.sh   # bigger
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    secret() { python3 -c "import secrets; print(secrets.token_urlsafe(${1:-32}))"; }
    sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 24)|" \
        -e "s|^JWT_SECRET=.*|JWT_SECRET=$(secret 48)|" .env.example > .env
    echo "Wrote .env with generated secrets."
fi

docker compose up --build -d --wait
docker compose exec backend python -m bench.seed_scale --points "${POINTS:-100000}"

cat <<MSG

Open http://localhost:3000 and sign in:
  bench@labflow.dev / labflow-demo   (large tenant: open the experiment, then Analytics)
  admin@acme-labs.dev / labflow-demo (small demo data)
MSG
