# ===========================
# STAGE 1: Builder
# ===========================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json ./

# Instalar SOLO dependencias de producción
RUN npm install --omit=dev && npm cache clean --force

# ===========================
# STAGE 2: Runner
# ===========================
FROM node:20-alpine

WORKDIR /app

# Crear usuario no-root para seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar dependencias desde builder
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Copiar archivos de la aplicación
COPY --chown=appuser:appgroup package.json ./
COPY --chown=appuser:appgroup src ./src

# Instalar wget para healthcheck
RUN apk add --no-cache wget

# Cambiar al usuario no-root
USER appuser

# Exponer el puerto
EXPOSE 3001

# Healthcheck interno
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Comando de ejecución
CMD ["node", "src/index.js"]