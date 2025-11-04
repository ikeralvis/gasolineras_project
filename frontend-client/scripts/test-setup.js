// scripts/test-setup.js
// Script simple para verificar que la configuración básica funciona

console.log('🧪 Verificando configuración del frontend...\n');

// Verificar que las dependencias críticas estén disponibles
try {
  require('react');
  console.log('✅ React está disponible');
} catch (e) {
  console.log('❌ React no está disponible');
}

try {
  require('react-dom');
  console.log('✅ React DOM está disponible');
} catch (e) {
  console.log('❌ React DOM no está disponible');
}

try {
  require('axios');
  console.log('✅ Axios está disponible');
} catch (e) {
  console.log('❌ Axios no está disponible');
}

try {
  require('react-router-dom');
  console.log('✅ React Router está disponible');
} catch (e) {
  console.log('❌ React Router no está disponible');
}

// Verificar variables de entorno
console.log('\n🔧 Variables de entorno:');
console.log('VITE_API_BASE_URL:', process.env.VITE_API_BASE_URL || 'No configurada');

console.log('\n✨ Configuración verificada!');
console.log('Ejecuta "npm run dev" para iniciar el servidor de desarrollo.');