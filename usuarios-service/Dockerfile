FROM node:20
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY src ./src
COPY init.sql ./init.sql
# Exponer el puerto
EXPOSE 3001

# Comando de ejecución
CMD [ "node", "src/index.js" ]