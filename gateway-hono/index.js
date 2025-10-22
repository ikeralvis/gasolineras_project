import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'Gateway OK' }))

// Proxy hacia el microservicio de datos
app.get("/api/datos/*", async (c) => {
  const path = c.req.path.replace("/api/datos", "");
  const response = await fetch(`http://datos:8000${path}`);
  const data = await response.json();
  return c.json(data);
});

// Proxy hacia el microservicio de usuarios
app.get("/api/usuarios/*", async (c) => {
  const path = c.req.path.replace("/api/usuarios", "");
  const response = await fetch(`http://usuarios:3001${path}`);
  const data = await response.json();
  return c.json(data);
});

serve({ fetch: app.fetch, port: 8080 })
console.log('Gateway listo en http://localhost:8080')
