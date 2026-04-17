FROM node:25-slim AS build
WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

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
# Nota: pnpm-lock.yaml debe estar en el repo para builds reproducibles
COPY package.json ./
COPY pnpm-lock.yaml* ./

# Instalar dependencias
# Si existe pnpm-lock.yaml usa --frozen-lockfile, sino instala normalmente
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      pnpm install; \
    fi

# Copiar código fuente
COPY . .

# Build (las variables VITE_* se inyectan aquí)
RUN pnpm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
