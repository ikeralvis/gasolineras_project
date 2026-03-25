# MCP Gasolineras Server

Servidor MCP desacoplado para exponer herramientas de dominio sobre tu stack existente.

## Objetivo

- Exponer tools semánticas para asistentes IA/voz.
- No acoplar el LLM a endpoints REST crudos.
- Permitir descubrimiento básico de infraestructura sin acoplarse a cada microservicio.

## Tools implementadas

- `get_snapshot_status`: consulta frescura de datos de gasolineras.
- `ensure_fresh_snapshot`: fuerza sync solo si el snapshot no está vigente.
- `find_nearest_station`: obtiene estaciones cercanas por coordenadas.
- `find_cheapest_nearby`: devuelve la más barata en radio.
- `discover_infra`: obtiene estado de servicios vía gateway `/health`.

## Ejecución

```bash
npm install
npm run start
```

Por defecto usa transporte stdio (ideal para clientes MCP).

## Variables de entorno

Ver `.env.example`.
