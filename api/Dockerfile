FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
COPY api/package.json api/
COPY ui/package.json ui/
RUN npm install --workspace=@show-uploader/api --workspace=@show-uploader/ui

FROM base AS ui-builder
# Vite bakes VITE_* into the bundle at build time. ui/.env is gitignored, so on
# a clean server build these must arrive as build args (from the stack .env).
ARG VITE_ZITADEL_DOMAIN
ARG VITE_ZITADEL_CLIENT_ID
ARG VITE_POCKETBASE_URL
ENV VITE_ZITADEL_DOMAIN=$VITE_ZITADEL_DOMAIN \
    VITE_ZITADEL_CLIENT_ID=$VITE_ZITADEL_CLIENT_ID \
    VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
COPY ui/ ui/
RUN npm run build --workspace=@show-uploader/ui

FROM base AS api-builder
COPY api/src/ api/src/
COPY api/tsconfig.json api/
RUN npm run build --workspace=@show-uploader/api

FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY api/package.json api/
RUN npm install --workspace=@show-uploader/api --omit=dev
COPY --from=api-builder /app/api/dist api/dist
COPY --from=ui-builder /app/ui/dist ui/dist
# tsc does not copy .sql files; migration runner reads them at runtime
COPY api/src/db/migrations/ api/dist/db/migrations/
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
