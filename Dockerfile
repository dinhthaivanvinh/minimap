# Build the React pages.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run the server. It has no dependencies, and Node runs its TypeScript directly.
FROM node:24-alpine

# tzdata lets TZ in .env set the time of the morning reset.
RUN apk add --no-cache tzdata

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown node:node /app/data
USER node

ENV DATA_FILE=/app/data/data.json
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/state || exit 1

CMD ["node", "server/server.ts"]
