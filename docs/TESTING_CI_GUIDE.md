# 🧪 Guía de Testing y CI/CD para TankGo

Esta guía detalla qué tests implementar y cómo configurar CI/CD para el proyecto.

---

## 📋 Índice

1. [Estrategia de Testing](#estrategia-de-testing)
2. [Tests por Servicio](#tests-por-servicio)
3. [Configuración de CI/CD](#configuración-de-cicd)
4. [Herramientas Recomendadas](#herramientas-recomendadas)

---

## 🎯 Estrategia de Testing

### Pirámide de Tests

```
        ╱╲
       ╱  ╲      E2E Tests (10%)
      ╱────╲     → Flujos completos de usuario
     ╱      ╲
    ╱────────╲   Integration Tests (30%)
   ╱          ╲  → APIs, Base de datos
  ╱────────────╲
 ╱              ╲ Unit Tests (60%)
╱────────────────╲ → Funciones, Componentes
```

### Cobertura Objetivo

| Tipo | Cobertura Mínima |
|------|-----------------|
| Unit Tests | 70% |
| Integration | 50% |
| E2E | Flujos críticos |

---

## 🧪 Tests por Servicio

### 1. Frontend (React + Vitest)

#### Unit Tests - Componentes

```typescript
// tests/components/GasolinerasTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GasolinerasTable from '../src/components/GasolinerasTable';

describe('GasolinerasTable', () => {
  it('debe renderizar la tabla con gasolineras', () => {
    const mockGasolineras = [
      { IDEESS: '1', Rótulo: 'Repsol', Municipio: 'Madrid', 'Precio Gasolina 95 E5': '1.459' }
    ];
    
    render(<GasolinerasTable gasolineras={mockGasolineras} combustibleSeleccionado="Precio Gasolina 95 E5" />);
    
    expect(screen.getByText('Repsol')).toBeInTheDocument();
    expect(screen.getByText('Madrid')).toBeInTheDocument();
  });

  it('debe mostrar mensaje cuando no hay gasolineras', () => {
    render(<GasolinerasTable gasolineras={[]} combustibleSeleccionado="Precio Gasolina 95 E5" />);
    
    expect(screen.getByText(/no se encontraron/i)).toBeInTheDocument();
  });
});
```

#### Unit Tests - Hooks

```typescript
// tests/hooks/useFavorites.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFavorites } from '../src/hooks/useFavorites';

describe('useFavorites', () => {
  it('debe añadir un favorito', async () => {
    const { result } = renderHook(() => useFavorites());
    
    await act(async () => {
      await result.current.addFavorito('12345');
    });
    
    expect(result.current.favoritos).toContain('12345');
  });

  it('debe eliminar un favorito', async () => {
    const { result } = renderHook(() => useFavorites());
    
    // Primero añadir
    await act(async () => {
      await result.current.addFavorito('12345');
    });
    
    // Luego eliminar
    await act(async () => {
      await result.current.removeFavorito('12345');
    });
    
    expect(result.current.favoritos).not.toContain('12345');
  });
});
```

#### Unit Tests - Utilidades

```typescript
// tests/utils/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrecio, parsePrecioEspanol } from '../src/utils/formatters';

describe('formatPrecio', () => {
  it('debe formatear precios correctamente', () => {
    expect(formatPrecio(1.459)).toBe('1,459 €');
    expect(formatPrecio(1.5)).toBe('1,500 €');
  });

  it('debe manejar valores nulos', () => {
    expect(formatPrecio(null)).toBe('-');
    expect(formatPrecio(undefined)).toBe('-');
  });
});

describe('parsePrecioEspanol', () => {
  it('debe parsear precios con coma', () => {
    expect(parsePrecioEspanol('1,459')).toBe(1.459);
  });

  it('debe manejar strings vacíos', () => {
    expect(parsePrecioEspanol('')).toBeNull();
  });
});
```

#### Integration Tests - API

```typescript
// tests/api/gasolineras.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { getGasolineras, getGasolinerasCerca } from '../src/api/gasolineras';

const server = setupServer(
  http.get('/api/gasolineras', () => {
    return HttpResponse.json({
      total: 1,
      gasolineras: [{ IDEESS: '1', Rótulo: 'Test' }]
    });
  }),
  http.get('/api/gasolineras/cerca', () => {
    return HttpResponse.json({
      count: 1,
      gasolineras: [{ IDEESS: '1', distancia: 500 }]
    });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('API Gasolineras', () => {
  it('debe obtener lista de gasolineras', async () => {
    const result = await getGasolineras();
    expect(result.gasolineras).toHaveLength(1);
  });

  it('debe obtener gasolineras cercanas', async () => {
    const result = await getGasolinerasCerca(40.4168, -3.7038, 10);
    expect(result[0]).toHaveProperty('distancia');
  });
});
```

---

### 2. Usuarios Service (Node.js + Jest)

#### Unit Tests

```javascript
// tests/validators.test.js
const { validateEmail, validateStrongPassword, sanitizeName } = require('../src/utils/validators');

describe('Validators', () => {
  describe('validateEmail', () => {
    it('debe aceptar emails válidos', () => {
      expect(validateEmail('user@example.com').valid).toBe(true);
      expect(validateEmail('user.name@domain.org').valid).toBe(true);
    });

    it('debe rechazar emails inválidos', () => {
      expect(validateEmail('invalid').valid).toBe(false);
      expect(validateEmail('user@').valid).toBe(false);
      expect(validateEmail('@domain.com').valid).toBe(false);
    });
  });

  describe('validateStrongPassword', () => {
    it('debe aceptar contraseñas fuertes', () => {
      expect(validateStrongPassword('Abc123!@#').valid).toBe(true);
    });

    it('debe rechazar contraseñas débiles', () => {
      expect(validateStrongPassword('12345678').valid).toBe(false);
      expect(validateStrongPassword('password').valid).toBe(false);
      expect(validateStrongPassword('Pass1!').valid).toBe(false); // Muy corta
    });
  });

  describe('sanitizeName', () => {
    it('debe sanitizar nombres', () => {
      expect(sanitizeName('  John Doe  ')).toBe('John Doe');
      expect(sanitizeName('<script>alert("xss")</script>')).not.toContain('<script>');
    });
  });
});
```

#### Integration Tests - API

```javascript
// tests/auth.integration.test.js
const fastify = require('fastify');
const authRoutes = require('../src/routes/auth');

describe('Auth Routes', () => {
  let app;

  beforeAll(async () => {
    app = fastify();
    // Configurar plugins mock
    await app.register(authRoutes, { prefix: '/api/usuarios' });
  });

  afterAll(() => app.close());

  describe('POST /api/usuarios/register', () => {
    it('debe registrar un usuario nuevo', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/usuarios/register',
        payload: {
          nombre: 'Test User',
          email: 'test@example.com',
          password: 'SecurePass123!'
        }
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toHaveProperty('id');
    });

    it('debe rechazar email duplicado', async () => {
      // Primer registro
      await app.inject({
        method: 'POST',
        url: '/api/usuarios/register',
        payload: {
          nombre: 'Test',
          email: 'duplicate@example.com',
          password: 'SecurePass123!'
        }
      });

      // Segundo registro con mismo email
      const response = await app.inject({
        method: 'POST',
        url: '/api/usuarios/register',
        payload: {
          nombre: 'Test 2',
          email: 'duplicate@example.com',
          password: 'SecurePass123!'
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/usuarios/login', () => {
    it('debe devolver JWT con credenciales válidas', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/usuarios/login',
        payload: {
          email: 'test@example.com',
          password: 'SecurePass123!'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toHaveProperty('token');
    });

    it('debe rechazar credenciales inválidas', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/usuarios/login',
        payload: {
          email: 'test@example.com',
          password: 'wrongpassword'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

---

### 3. Gasolineras Service (Python + Pytest)

#### Unit Tests

```python
# tests/test_models.py
import pytest
from app.models.gasolinera import Gasolinera

class TestGasolineraModel:
    def test_crear_gasolinera_valida(self):
        """Debe crear una gasolinera con datos válidos"""
        gas = Gasolinera(
            IDEESS="12345",
            Rótulo="Repsol",
            Municipio="Madrid",
            Provincia="Madrid",
            Latitud=40.4168,
            Longitud=-3.7038
        )
        assert gas.IDEESS == "12345"
        assert gas.Rótulo == "Repsol"

    def test_coordenadas_validas(self):
        """Debe validar coordenadas en rango correcto"""
        gas = Gasolinera(Latitud=90.0, Longitud=180.0)
        assert gas.Latitud == 90.0
        assert gas.Longitud == 180.0

    def test_parsear_coordenadas_string(self):
        """Debe parsear coordenadas en formato string español"""
        gas = Gasolinera(Latitud="40,4168", Longitud="-3,7038")
        assert gas.Latitud == 40.4168
        assert gas.Longitud == -3.7038
```

```python
# tests/test_services.py
import pytest
from unittest.mock import patch, MagicMock
from app.services.fetch_gobierno import fetch_data_gobierno, parse_gasolinera

class TestFetchGobierno:
    @patch('app.services.fetch_gobierno.httpx.Client')
    def test_fetch_exitoso(self, mock_client):
        """Debe obtener datos de la API del gobierno"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "ListaEESSPrecio": [
                {"IDEESS": "1", "Rótulo": "Test", "Latitud": "40,0", "Longitud (WGS84)": "-3,0"}
            ]
        }
        mock_response.raise_for_status = MagicMock()
        mock_client.return_value.__enter__.return_value.get.return_value = mock_response

        result = fetch_data_gobierno()
        
        assert len(result) == 1
        assert result[0]["IDEESS"] == "1"

    def test_parse_gasolinera(self):
        """Debe parsear correctamente un registro"""
        raw = {
            "IDEESS": "12345",
            "Rótulo": "Test",
            "Latitud": "40,4168",
            "Longitud (WGS84)": "-3,7038",
            "Municipio": "Madrid",
            "Provincia": "Madrid"
        }
        
        result = parse_gasolinera(raw)
        
        assert result["IDEESS"] == "12345"
        assert result["Latitud"] == 40.4168
        assert result["Longitud"] == -3.7038
```

#### Integration Tests - API

```python
# tests/test_routes.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)

class TestGasolinerasRoutes:
    @patch('app.routes.gasolineras.get_collection')
    def test_get_gasolineras(self, mock_collection):
        """Debe devolver lista de gasolineras"""
        mock_collection.return_value.count_documents.return_value = 1
        mock_collection.return_value.find.return_value.skip.return_value.limit.return_value = [
            {"IDEESS": "1", "Rótulo": "Test"}
        ]
        
        response = client.get("/gasolineras/")
        
        assert response.status_code == 200
        assert response.json()["total"] == 1

    @patch('app.routes.gasolineras.get_collection')
    def test_get_gasolinera_por_id(self, mock_collection):
        """Debe devolver una gasolinera por ID"""
        mock_collection.return_value.find_one.return_value = {
            "IDEESS": "12345",
            "Rótulo": "Repsol"
        }
        
        response = client.get("/gasolineras/12345")
        
        assert response.status_code == 200
        assert response.json()["IDEESS"] == "12345"

    @patch('app.routes.gasolineras.get_collection')
    def test_gasolinera_no_encontrada(self, mock_collection):
        """Debe devolver 404 si no existe"""
        mock_collection.return_value.find_one.return_value = None
        
        response = client.get("/gasolineras/99999")
        
        assert response.status_code == 404

    def test_health_check(self):
        """Debe responder al health check"""
        response = client.get("/health")
        
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
```

---

### 4. E2E Tests (Playwright)

```typescript
// e2e/gasolineras.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Flujo de Gasolineras', () => {
  test('debe cargar la página principal', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/TankGo/);
    await expect(page.locator('nav')).toBeVisible();
  });

  test('debe mostrar lista de gasolineras', async ({ page }) => {
    await page.goto('/gasolineras');
    
    // Esperar a que carguen los datos
    await page.waitForSelector('[data-testid="gasolineras-table"]');
    
    // Verificar que hay filas
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount({ min: 1 });
  });

  test('debe filtrar por provincia', async ({ page }) => {
    await page.goto('/gasolineras');
    
    // Escribir en el filtro de provincia
    await page.fill('input[placeholder*="Provincia"]', 'Madrid');
    
    // Verificar que se filtran los resultados
    await page.waitForTimeout(500); // Debounce
    
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    
    // Verificar que todas las filas visibles son de Madrid
    for (let i = 0; i < Math.min(count, 5); i++) {
      const provincia = await rows.nth(i).locator('td:nth-child(3)').textContent();
      expect(provincia?.toLowerCase()).toContain('madrid');
    }
  });

  test('debe ordenar por precio', async ({ page }) => {
    await page.goto('/gasolineras');
    
    await page.waitForSelector('[data-testid="gasolineras-table"]');
    
    // Click en ordenar
    await page.click('button:has-text("Ordenar por precio")');
    
    // Obtener primeros precios
    const precios = await page.locator('table tbody tr td:nth-child(4)').allTextContents();
    
    // Verificar que están ordenados
    const preciosNum = precios.slice(0, 5).map(p => parseFloat(p.replace(',', '.')));
    
    for (let i = 1; i < preciosNum.length; i++) {
      expect(preciosNum[i]).toBeGreaterThanOrEqual(preciosNum[i - 1]);
    }
  });
});

test.describe('Flujo de Autenticación', () => {
  test('debe mostrar página de login', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Iniciar")')).toBeVisible();
  });

  test('debe mostrar error con credenciales inválidas', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Iniciar")');
    
    await expect(page.locator('.text-red-500, .error')).toBeVisible();
  });

  test('debe redirigir a login si no está autenticado', async ({ page }) => {
    await page.goto('/favoritos');
    
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Flujo de Favoritos', () => {
  test.beforeEach(async ({ page }) => {
    // Login antes de cada test
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button:has-text("Iniciar")');
    await page.waitForURL('/');
  });

  test('debe añadir gasolinera a favoritos', async ({ page }) => {
    await page.goto('/gasolineras');
    
    // Click en el primer corazón
    await page.click('[data-testid="favorito-button"]:first-child');
    
    // Verificar que se añadió
    await expect(page.locator('[data-testid="favorito-button"]:first-child.active')).toBeVisible();
  });
});
```

---

## 🔄 Configuración de CI/CD

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master]

env:
  NODE_VERSION: '20'
  PYTHON_VERSION: '3.11'

jobs:
  # ==========================================
  # Frontend Tests
  # ==========================================
  frontend-test:
    name: 🎨 Frontend Tests
    runs-on: ubuntu-latest
    
    defaults:
      run:
        working-directory: ./frontend-client

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
          cache-dependency-path: ./frontend-client/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linter
        run: pnpm lint

      - name: Run type check
        run: pnpm tsc --noEmit

      - name: Run unit tests
        run: pnpm test:unit --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./frontend-client/coverage/lcov.info
          flags: frontend

  # ==========================================
  # Usuarios Service Tests
  # ==========================================
  usuarios-test:
    name: 👤 Usuarios Service Tests
    runs-on: ubuntu-latest
    
    defaults:
      run:
        working-directory: ./usuarios-service

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: ./usuarios-service/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --coverage
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: test
          DB_PASSWORD: test
          DB_NAME: test_db
          JWT_SECRET: test-secret-key

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./usuarios-service/coverage/lcov.info
          flags: usuarios

  # ==========================================
  # Gasolineras Service Tests
  # ==========================================
  gasolineras-test:
    name: ⛽ Gasolineras Service Tests
    runs-on: ubuntu-latest
    
    defaults:
      run:
        working-directory: ./gasolineras-service

    services:
      mongo:
        image: mongo:7
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-asyncio httpx

      - name: Run tests
        run: pytest --cov=app --cov-report=xml
        env:
          MONGO_HOST: localhost
          MONGO_PORT: 27017
          MONGO_DB: test_db

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./gasolineras-service/coverage.xml
          flags: gasolineras

  # ==========================================
  # E2E Tests
  # ==========================================
  e2e-test:
    name: 🎭 E2E Tests
    runs-on: ubuntu-latest
    needs: [frontend-test, usuarios-test, gasolineras-test]
    
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Start services with Docker Compose
        run: docker-compose up -d --build
        
      - name: Wait for services
        run: |
          chmod +x ./scripts/wait-for-services.sh
          ./scripts/wait-for-services.sh

      - name: Install Playwright
        working-directory: ./frontend-client
        run: |
          pnpm install
          pnpm exec playwright install --with-deps

      - name: Run E2E tests
        working-directory: ./frontend-client
        run: pnpm test:e2e

      - name: Upload test artifacts
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend-client/playwright-report/

      - name: Stop services
        if: always()
        run: docker-compose down

  # ==========================================
  # Build & Push Docker Images
  # ==========================================
  build:
    name: 🐳 Build Docker Images
    runs-on: ubuntu-latest
    needs: [frontend-test, usuarios-test, gasolineras-test]
    if: github.ref == 'refs/heads/master'
    
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend-client
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/tankgo-frontend:latest

      - name: Build and push Gateway
        uses: docker/build-push-action@v5
        with:
          context: ./gateway-hono
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/tankgo-gateway:latest

      - name: Build and push Usuarios
        uses: docker/build-push-action@v5
        with:
          context: ./usuarios-service
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/tankgo-usuarios:latest

      - name: Build and push Gasolineras
        uses: docker/build-push-action@v5
        with:
          context: ./gasolineras-service
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/tankgo-gasolineras:latest

  # ==========================================
  # Deploy to Render
  # ==========================================
  deploy:
    name: 🚀 Deploy to Render
    runs-on: ubuntu-latest
    needs: [build, e2e-test]
    if: github.ref == 'refs/heads/master'
    
    steps:
      - name: Deploy Frontend
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_FRONTEND }}"
          
      - name: Deploy Gateway
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_GATEWAY }}"
          
      - name: Deploy Usuarios Service
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_USUARIOS }}"
          
      - name: Deploy Gasolineras Service
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_GASOLINERAS }}"
```

### Script para esperar servicios

```bash
# scripts/wait-for-services.sh
#!/bin/bash

echo "⏳ Esperando a que los servicios estén listos..."

# Esperar Gateway
until curl -s http://localhost:8080/health > /dev/null; do
  echo "Esperando Gateway..."
  sleep 2
done
echo "✅ Gateway listo"

# Esperar Frontend
until curl -s http://localhost:80 > /dev/null; do
  echo "Esperando Frontend..."
  sleep 2
done
echo "✅ Frontend listo"

echo "🚀 Todos los servicios están listos!"
```

---

## 🛠️ Herramientas Recomendadas

### Frontend
| Herramienta | Uso |
|-------------|-----|
| **Vitest** | Unit tests (rápido, compatible con Vite) |
| **Testing Library** | Tests de componentes React |
| **MSW** | Mock de APIs en tests |
| **Playwright** | E2E tests |

### Backend Node.js
| Herramienta | Uso |
|-------------|-----|
| **Jest** | Tests unitarios e integración |
| **Supertest** | Tests de HTTP |

### Backend Python
| Herramienta | Uso |
|-------------|-----|
| **Pytest** | Framework de tests |
| **pytest-cov** | Cobertura de código |
| **httpx** | Cliente HTTP async para tests |

### Cobertura y Calidad
| Herramienta | Uso |
|-------------|-----|
| **Codecov** | Reportes de cobertura |
| **SonarCloud** | Análisis de calidad |
| **ESLint/Biome** | Linting |

---

## 📁 Estructura de Tests Sugerida

```
frontend-client/
├── tests/
│   ├── components/
│   │   ├── GasolinerasTable.test.tsx
│   │   ├── Navbar.test.tsx
│   │   └── FavoritoButton.test.tsx
│   ├── hooks/
│   │   ├── useFavorites.test.tsx
│   │   └── useEstadisticas.test.tsx
│   ├── api/
│   │   └── gasolineras.test.ts
│   └── utils/
│       └── formatters.test.ts
├── e2e/
│   ├── gasolineras.spec.ts
│   ├── auth.spec.ts
│   └── favoritos.spec.ts
└── vitest.config.ts

usuarios-service/
├── tests/
│   ├── validators.test.js
│   ├── auth.test.js
│   └── favorites.test.js
└── jest.config.js

gasolineras-service/
├── tests/
│   ├── test_models.py
│   ├── test_services.py
│   └── test_routes.py
└── pytest.ini
```

---

## 🚀 Próximos Pasos

1. **Instalar dependencias de testing** en cada servicio
2. **Crear los archivos de configuración** (vitest.config.ts, jest.config.js, pytest.ini)
3. **Implementar tests críticos** primero (auth, favoritos, filtros)
4. **Configurar GitHub Actions** con el workflow
5. **Añadir badges** al README
6. **Configurar Codecov** para reportes de cobertura

---

> 💡 **Tip**: Empieza por los tests unitarios de las funciones más críticas (validadores, formateo de precios) y ve expandiendo gradualmente.
