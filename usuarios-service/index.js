import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

const fastify = Fastify({ logger: true });

await fastify.register(fastifySwagger, {
  openapi: {
    info: { title: "Usuarios API", version: "1.0.0" },
  },
});
await fastify.register(fastifySwaggerUi, { routePrefix: "/docs" });

fastify.post('/usuarios', async (req, reply) => {
  // aquí guardarías en Postgres
  return { message: "usuario creado", body: req.body };
});

fastify.post('/login', async (req, reply) => {
  // autenticación mock
  return { token: "jwt-simul" };
});

fastify.get('/usuarios/:id/favoritos', async (req, reply) => {
  return [{ id: "9876", nombre: "CEPSA BILBAO" }];
});

await fastify.listen({ port: 3001, host: "0.0.0.0" });
