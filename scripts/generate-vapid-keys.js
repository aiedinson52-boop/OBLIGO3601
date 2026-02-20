/**
 * Script para generar claves VAPID para Web Push
 * 
 * Ejecutar: node scripts/generate-vapid-keys.js
 * 
 * Luego configurar las claves como variables de entorno en Vercel:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT
 */

import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('━'.repeat(60));
console.log('🔑 Claves VAPID generadas exitosamente');
console.log('━'.repeat(60));
console.log('');
console.log('VAPID_PUBLIC_KEY=');
console.log(vapidKeys.publicKey);
console.log('');
console.log('VAPID_PRIVATE_KEY=');
console.log(vapidKeys.privateKey);
console.log('');
console.log('VAPID_SUBJECT=mailto:tu-email@ejemplo.com');
console.log('');
console.log('━'.repeat(60));
console.log('📋 Instrucciones:');
console.log('1. Copia las claves anteriores');
console.log('2. Ve al dashboard de Vercel → tu proyecto → Settings → Environment Variables');
console.log('3. Agrega VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, y VAPID_SUBJECT');
console.log('4. Redespliega el proyecto');
console.log('━'.repeat(60));
