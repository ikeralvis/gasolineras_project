#!/usr/bin/env node

/**
 * 🧪 Script de Testing del Gateway
 * 
 * Prueba todas las funcionalidades del gateway de forma automatizada
 */

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSuccess(message) {
  log('✅', message, colors.green);
}

function logError(message) {
  log('❌', message, colors.red);
}

function logInfo(message) {
  log('ℹ️', message, colors.cyan);
}

function logTest(message) {
  log('🧪', message, colors.yellow);
}

async function testEndpoint(name, url, options = {}) {
  logTest(`Testing: ${name}`);
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    
    let data;
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (response.ok) {
      logSuccess(`${name} - Status: ${response.status}`);
      console.log(JSON.stringify(data, null, 2).substring(0, 200) + '...\n');
      return { success: true, data, status: response.status };
    } else {
      logError(`${name} - Status: ${response.status}`);
      console.log(data);
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    logError(`${name} - Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testBasicEndpoints() {
  let passed = 0;
  let failed = 0;

  logInfo('TEST 1: Información del Gateway');
  const test1 = await testEndpoint('GET /', `${BASE_URL}/`);
  test1.success ? passed++ : failed++;

  logInfo('TEST 2: Health Check');
  const test2 = await testEndpoint('GET /health', `${BASE_URL}/health`);
  test2.success ? passed++ : failed++;

  logInfo('TEST 3: Especificación OpenAPI');
  const test3 = await testEndpoint('GET /openapi.json', `${BASE_URL}/openapi.json`);
  test3.success ? passed++ : failed++;

  logInfo('TEST 4: Obtener Gasolineras');
  const test4 = await testEndpoint('GET /api/gasolineras', `${BASE_URL}/api/gasolineras`);
  test4.success ? passed++ : failed++;

  logInfo('TEST 5: Ruta No Encontrada (debe dar 404)');
  const test5 = await testEndpoint('GET /ruta-inexistente', `${BASE_URL}/ruta-inexistente`);
  (test5.status === 404) ? passed++ : failed++;

  return { passed, failed };
}

async function testUserAuthentication() {
  let passed = 0;
  let failed = 0;
  let authToken = null;

  logInfo('TEST 6: Registro de Usuario');
  const randomEmail = `test${Date.now()}@example.com`;
  const test6 = await testEndpoint(
    'POST /api/usuarios/register',
    `${BASE_URL}/api/usuarios/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: randomEmail,
        password: 'test123456',
        nombre: 'Test User'
      })
    }
  );
  
  if (test6.success || test6.status === 409) {
    passed++;
    if (test6.status === 409) {
      logInfo('Usuario ya existe (esperado en algunos casos)');
    }
  } else {
    failed++;
  }

  logInfo('TEST 7: Login de Usuario');
  const test7 = await testEndpoint(
    'POST /api/usuarios/login',
    `${BASE_URL}/api/usuarios/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: randomEmail,
        password: 'test123456'
      })
    }
  );
  
  if (test7.success && test7.data.token) {
    passed++;
    authToken = test7.data.token;
    logSuccess(`Token obtenido: ${authToken.substring(0, 20)}...`);
  } else {
    failed++;
  }

  return { passed, failed, authToken };
}

async function testAuthenticatedEndpoints(authToken) {
  let passed = 0;
  let failed = 0;

  if (authToken) {
    logInfo('TEST 8: Obtener Favoritos (autenticado)');
    const test8 = await testEndpoint(
      'GET /api/usuarios/favorites',
      `${BASE_URL}/api/usuarios/favorites`,
      {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
    );
    test8.success ? passed++ : failed++;
  } else {
    logError('TEST 8: Saltado (no hay token de autenticación)');
    failed++;
  }

  return { passed, failed };
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  log('🚀', 'Iniciando tests del API Gateway', colors.blue);
  log('🌍', `URL Base: ${BASE_URL}`, colors.blue);
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Gateway Info
  logInfo('TEST 1: Información del Gateway');
  const test1 = await testEndpoint(
    'GET /',
    `${BASE_URL}/`
  );
  test1.success ? passed++ : failed++;

  // Test 2: Health Check
  logInfo('TEST 2: Health Check');
  const test2 = await testEndpoint(
    'GET /health',
    `${BASE_URL}/health`
  );
  test2.success ? passed++ : failed++;

  // Test 3: OpenAPI Spec
  logInfo('TEST 3: Especificación OpenAPI');
  const test3 = await testEndpoint(
    'GET /openapi.json',
    `${BASE_URL}/openapi.json`
  );
  test3.success ? passed++ : failed++;

  // Test 4: Gasolineras
  logInfo('TEST 4: Obtener Gasolineras');
  const test4 = await testEndpoint(
    'GET /api/gasolineras',
    `${BASE_URL}/api/gasolineras`
  );
  test4.success ? passed++ : failed++;

  // Test 5: 404 - Ruta no encontrada
  logInfo('TEST 5: Ruta No Encontrada (debe dar 404)');
  const test5 = await testEndpoint(
    'GET /ruta-inexistente',
    `${BASE_URL}/ruta-inexistente`
  );
  (test5.status === 404) ? passed++ : failed++;

  // Test 6: Registro de Usuario (puede fallar si ya existe)
  logInfo('TEST 6: Registro de Usuario');
  const randomEmail = `test${Date.now()}@example.com`;
  const test6 = await testEndpoint(
    'POST /api/usuarios/register',
    `${BASE_URL}/api/usuarios/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: randomEmail,
        password: 'test123456',
        nombre: 'Test User'
      })
    }
  );
  if (test6.success || test6.status === 409) {
    passed++;
    if (test6.status === 409) {
      logInfo('Usuario ya existe (esperado en algunos casos)');
    }
  } else {
    failed++;
  }

  // Test 7: Login con usuario de prueba
  logInfo('TEST 7: Login de Usuario');
  const test7 = await testEndpoint(
    'POST /api/usuarios/login',
    `${BASE_URL}/api/usuarios/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: randomEmail,
        password: 'test123456'
      })
    }
  );
  
  let authToken = null;
  if (test7.success && test7.data.token) {
    passed++;
    authToken = test7.data.token;
    logSuccess(`Token obtenido: ${authToken.substring(0, 20)}...`);
  } else {
    failed++;
  }

  // Test 8: Favoritos (requiere autenticación)
  if (authToken) {
    logInfo('TEST 8: Obtener Favoritos (autenticado)');
    const test8 = await testEndpoint(
      'GET /api/usuarios/favorites',
      `${BASE_URL}/api/usuarios/favorites`,
      {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
    );
    test8.success ? passed++ : failed++;
  } else {
    logError('TEST 8: Saltado (no hay token de autenticación)');
    failed++;
  }

  // Resumen
  console.log('\n' + '='.repeat(60));
  log('📊', 'RESUMEN DE TESTS', colors.blue);
  console.log('='.repeat(60));
  logSuccess(`Tests exitosos: ${passed}`);
  if (failed > 0) {
    logError(`Tests fallidos: ${failed}`);
  }
  console.log('='.repeat(60) + '\n');

  if (failed === 0) {
    log('🎉', '¡Todos los tests pasaron correctamente!', colors.green);
  } else {
    log('⚠️', 'Algunos tests fallaron. Revisa los logs.', colors.yellow);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar tests
try {
  await runTests();
} catch (error) {
  logError(`Error fatal: ${error.message}`);
  process.exit(1);
}
