// Service Worker para TankGo PWA
const CACHE_NAME = 'tankgo-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/logo.png'
];

// URLs de la API que queremos cachear
const API_CACHE_NAME = 'tankgo-api-v1';
const API_URLS = [
  '/api/gasolineras',
  '/api/gasolineras/estadisticas'
];

// Instalación - cachear assets estáticos
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => globalThis.skipWaiting())
  );
});

// Activación - limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activado');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('🗑️ Service Worker: Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => globalThis.clients.claim())
  );
});

// Estrategia de fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar requests del mismo origen o de nuestra API
  if (!url.origin.includes(self.location.origin) && !url.pathname.startsWith('/api/')) {
    return;
  }

  // Para peticiones de API - Network First con fallback a cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      networkFirstWithCache(request)
    );
    return;
  }

  // Para assets estáticos - Cache First con fallback a network
  event.respondWith(
    cacheFirstWithNetwork(request)
  );
});

// Network First - intenta red, si falla usa cache
async function networkFirstWithCache(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Si la respuesta es exitosa, guardarla en cache
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('📴 Error al intentar obtener datos de la red:', error);
    console.log('📴 Sin conexión, buscando en cache:', request.url);
    try {
      const cachedResponse = await caches.match(request);
      
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Si no hay cache, devolver respuesta de error
      return new Response(
        JSON.stringify({ 
          error: 'Sin conexión', 
          offline: true,
          message: 'No hay conexión a internet y no hay datos en cache'
        }),
        { 
          status: 503, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (cacheError) {
      console.error('Error al buscar en cache:', cacheError);
      return new Response(
        JSON.stringify({ 
          error: 'Error interno', 
          message: 'No se pudo manejar la solicitud debido a un error interno'
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
}

// Cache First - busca en cache, si no existe va a la red
async function cacheFirstWithNetwork(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Guardar en cache si es exitosa
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback para navegación - devolver index.html (SPA)
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    throw error;
  }
}

// Manejar mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    globalThis.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_FAVORITES') {
    // Cachear gasolineras favoritas
    const favoritos = event.data.favoritos || [];
    cacheGasolinerasFavoritas(favoritos);
  }
});

// Cachear gasolineras favoritas para acceso offline
async function cacheGasolinerasFavoritas(favoritos) {
  const cache = await caches.open(API_CACHE_NAME);
  
  for (const ideess of favoritos) {
    try {
      const response = await fetch(`/api/gasolineras/${ideess}`);
      if (response.ok) {
        cache.put(`/api/gasolineras/${ideess}`, response);
      }
    } catch (error) {
      console.error('Error cacheando favorito:', ideess, error);
      throw error;
    }
  }
}

// Background Sync para sincronizar cuando vuelva la conexión
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  // Implementar sincronización de favoritos pendientes
  console.log('🔄 Sincronizando favoritos pendientes...');
}
