import { Hono } from 'hono';
import axios from 'axios';
import { config } from '../config.js';

const auth = new Hono();

// Proxy para /auth/*
auth.all('/*', async (c) => {
  const path = c.req.path.replace(/^\/auth/, '');
  const url = `${config.services.auth}${path}`;
  const method = c.req.method;
  const body = await c.req.json().catch(() => null);
  const headers = Object.fromEntries(c.req.raw.headers);

  try {
    const response = await axios({
      url,
      method,
      data: body,
      headers,
    });
    return c.json(response.data, response.status);
  } catch (err) {
    console.error('❌ Error en proxy /auth:', err.message);
    return c.json({ error: 'Fallo en proxy hacia auth-service' }, 502);
  }
});

export default auth;
