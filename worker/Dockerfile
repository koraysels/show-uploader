FROM node:20-alpine AS builder
RUN apk add --no-cache ffmpeg python3 make g++
WORKDIR /app
COPY package.json ./
COPY worker/package.json worker/
RUN npm install --workspace=@show-uploader/worker
COPY worker/src/ worker/src/
COPY worker/tsconfig.json worker/
RUN npm run build --workspace=@show-uploader/worker

FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json ./
COPY worker/package.json worker/
RUN npm install --workspace=@show-uploader/worker --omit=dev
COPY --from=builder /app/worker/dist worker/dist
CMD ["node", "worker/dist/index.js"]
