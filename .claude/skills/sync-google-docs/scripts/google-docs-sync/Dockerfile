FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin /app/bin
COPY scripts /app/scripts
USER app
ENTRYPOINT ["node", "/app/bin/google-docs-sync.mjs"]
