# Multi-Stage-Build für die Aktionskoordination (Next.js + Prisma)
# Node.js 24 LTS auf Debian slim (Prisma benötigt OpenSSL)

FROM node:24-bookworm-slim AS base
# openssl: Prisma-Engines; curl: Health-Check und Scheduled Tasks von Coolify
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── Stage 1: Build ──────────────────────────────────────────────────
FROM base AS builder

# Werte, die beim Build fest eingebaut werden. Coolify übergibt sie als
# Build-Argumente, wenn sie dort als "Build Variable" markiert sind.
# Nach einer Änderung ist ein Redeploy (Neubau) nötig, kein Restart.
ARG NEXT_PUBLIC_ORG_SHORT_NAME
ARG NEXT_PUBLIC_MAP_CENTER
ARG NEXT_PUBLIC_MAP_ZOOM
ARG NEXT_PUBLIC_WAHLKREIS_LABEL
ARG NEXT_PUBLIC_WAHLKREIS_LABEL_PLURAL
ARG NEXT_PUBLIC_WAHLKREIS_LABEL_SHORT
# Meta-Beschreibung im Root-Layout, landet in den statisch gerenderten Seiten
ARG ORG_FULL_NAME
# Wird von next.config.ts in die Header-Regeln (CSP frame-ancestors) übernommen
ARG ALLOWED_EMBED_DOMAIN

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# Schlägt ein Test fehl, bricht der Build ab und das laufende Deployment bleibt
RUN npm test
RUN npm run build && rm -rf .next/cache

# Bootstrap-Script zu einer JS-Datei bündeln, damit es im Laufzeit-Image
# ohne tsx (devDependency) läuft
RUN npx esbuild prisma/bootstrap.ts --bundle --platform=node --format=cjs \
    --packages=external --outfile=dist/bootstrap.js

# ── Stage 2: Laufzeit ───────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Zeitzone bewusst UTC lassen (Node-Default): Aktionsdaten liegen als
# UTC-Mitternacht in der DB, mehrere Routen rechnen mit lokaler Zeit.

COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall führt "prisma generate" aus (prisma ist eine Dependency)
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
# .next muss für den Laufzeit-Cache schreibbar sein, alles andere nur lesbar
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3000

# Kein HEALTHCHECK: Der Health-Check wird in Coolify konfiguriert (/api/health).

# Migrationen vor dem Start ausführen; schlägt eine fehl, startet die App nicht
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node_modules/.bin/next start"]
