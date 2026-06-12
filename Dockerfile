FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

RUN npx prisma generate

COPY . .

RUN npm run build && ls dist/main.js

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# Prisma 7 lee la URL de la BD desde prisma.config.ts (process.env.DATABASE_URL),
# necesario para que `prisma migrate deploy` funcione en el contenedor.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

# Aplica las migraciones pendientes antes de arrancar el servidor.
# Así nuevas tablas (p. ej. registro_otp) se crean automáticamente en cada deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
