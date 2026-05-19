FROM node:25-slim AS build
WORKDIR /app

# Instalar pnpm v9 (debe coincidir con lockfileVersion: '9.0')
RUN npm install -g pnpm@9

# Build args para variables de entorno de Vite
ARG VITE_API_BASE_URL
ARG VITE_VOICE_WS_URL
ARG VITE_VOICE_WS_ENABLED
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_VOICE_WS_URL=$VITE_VOICE_WS_URL
ENV VITE_VOICE_WS_ENABLED=$VITE_VOICE_WS_ENABLED
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml .npmrc ./

# Instalar dependencias con lockfile fijo (reproducible)
RUN pnpm install --frozen-lockfile

# Copiar código fuente y construir
COPY . .
RUN pnpm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
