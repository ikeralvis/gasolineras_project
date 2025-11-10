import { Hono } from 'hono';
import axios from 'axios';
import { config } from '../config.js';

const gasolineras = new Hono();

gasolineras.all('/*', async (c) => {
  const path = c.req.path.replace(/^\/gasolineras/, '');
  
  // Obtener query params correctamente
  const searchParams = new URL(c.req.url).searchParams;
  const queryString = searchParams.toString();
  
  const url = `${config.services.gasolineras}${path}${queryString ? '?' + queryString : ''}`;
  const method = c.req.method;
  const body = await c.req.json().catch(() => null);
  const headers = Object.fromEntries(c.req.raw.headers);

  console.log(`🔄 Proxy ${method} ${url}`);

  try {
    const response = await axios({
      url,
      method,
      data: body,
      headers,
    });
    return c.json(response.data, response.status);
  } catch (err) {
    console.error('❌ Error en proxy /gasolineras:', err.message);
    return c.json({ error: 'Fallo en proxy hacia gasolineras-service' }, 502);
  }
});

export default gasolineras;
