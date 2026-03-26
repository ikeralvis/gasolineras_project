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
- `list_gasolineras_filtered`: lista gasolineras con filtros de provincia, municipio y precio.
- `get_user_profile_preferences`: obtiene perfil del usuario autenticado y su combustible favorito.
- `get_user_favorite_stations`: obtiene favoritos del usuario e hidrata detalle de estación.
- `find_nearest_for_user_preference`: devuelve la más cercana con precio del combustible preferido del usuario.
- `find_nearest_favorite_station`: busca la favorita del usuario más cercana.
- `find_best_price_distance_for_user`: calcula la mejor opción combinando precio + distancia y sesgo por favoritas.
- `discover_infra`: obtiene estado de servicios vía gateway `/health`.

## Ejecución

```bash
npm install
npm run start
```

Por defecto usa transporte stdio (ideal para clientes MCP).

## Variables de entorno

Ver `.env.example`.

Notas:

- Para tools que requieren usuario autenticado, puedes enviar `authToken` por input.
- Alternativamente, puedes definir `DEFAULT_USER_BEARER_TOKEN` en entorno para no repetirlo en cada llamada.
