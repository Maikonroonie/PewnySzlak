# Obraz API + synchronizatora danych (ten sam obraz, inne polecenie startowe).
# Zawiera Node 24 (API, sync) oraz Pythona z pyosmium (importer OSM).
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Zależności (warstwa cache'owana osobno od kodu)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
RUN npm ci --omit=dev --workspace=@pewnyszlak/api --workspace=@pewnyszlak/domain --include-workspace-root=false \
 && npm install --no-save tsx@^4

COPY services/importer/requirements.txt /importer/requirements.txt
RUN pip3 install --no-cache-dir -r /importer/requirements.txt

# Kod
COPY packages/domain packages/domain
COPY apps/api apps/api
COPY infra/db infra/db
COPY services/importer /importer

WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD curl -fsS http://localhost:4000/v1/health || exit 1
CMD ["npx", "tsx", "src/server.ts"]
