FROM node:25 AS build
WORKDIR /app

# Build args para variables de entorno de Vite
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_GOOGLE_CLIENT_ID

# Convertir args a variables de entorno para el build
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Instalar pnpm
RUN npm install -g pnpm

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

FROM nginx:1.29.3-alpine3.22-slim
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
