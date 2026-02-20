/**
 * Punto de entrada de la aplicación
 * Asistente de Voz Colombiano
 * Zona horaria: America/Bogota (UTC-5)
 */

import { inicializarApp } from './App.js';
import { registrarPush, pushSoportado } from './services/PushService.js';

// Configurar zona horaria colombiana
const TIMEZONE = 'America/Bogota';

/**
 * Formatea la hora actual en zona horaria colombiana
 * @returns {string} Hora formateada
 */
function getHoraColombia() {
    return new Date().toLocaleString('es-CO', {
        timeZone: TIMEZONE,
        dateStyle: 'full',
        timeStyle: 'medium'
    });
}

/**
 * Log de inicio con información del sistema
 */
function logInicio() {
    console.log('%c🎙️ Asistente de Voz Colombiano', 'font-size: 24px; font-weight: bold; color: #6366f1;');
    console.log('%cGestión de Tareas con Calendario Inteligente', 'font-size: 14px; color: #64748b;');
    console.log('━'.repeat(50));
    console.log(`📅 Fecha y hora: ${getHoraColombia()}`);
    console.log(`🌎 Zona horaria: ${TIMEZONE} (UTC-5)`);
    console.log(`🖥️ Navegador: ${navigator.userAgent.split(' ').pop()}`);
    console.log('━'.repeat(50));
}

/**
 * Verifica las capacidades del navegador
 */
function verificarCapacidades() {
    const capacidades = {
        'IndexedDB': 'indexedDB' in window,
        'Speech Recognition': 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
        'Speech Synthesis': 'speechSynthesis' in window,
        'Notifications': 'Notification' in window,
        'Service Workers': 'serviceWorker' in navigator
    };

    console.log('📋 Capacidades del navegador:');
    Object.entries(capacidades).forEach(([nombre, disponible]) => {
        console.log(`   ${disponible ? '✅' : '❌'} ${nombre}`);
    });
    console.log('━'.repeat(50));

    // Advertencias
    if (!capacidades['Speech Recognition']) {
        console.warn('⚠️ El reconocimiento de voz no está disponible. Use Chrome o Edge.');
    }

    if (!capacidades['Notifications']) {
        console.warn('⚠️ Las notificaciones no están disponibles.');
    }

    return capacidades;
}

/**
 * Registra el Service Worker para notificaciones en segundo plano
 */
async function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registrado:', registration.scope);

            // Esperar a que el SW esté activo
            if (registration.installing) {
                await new Promise((resolve) => {
                    registration.installing.addEventListener('statechange', (e) => {
                        if (e.target.state === 'activated') resolve();
                    });
                });
            }

            // Registrar push notifications si está soportado
            if (pushSoportado()) {
                const pushRegistrado = await registrarPush(registration);
                if (pushRegistrado) {
                    console.log('🔔 Push notifications activadas');
                } else {
                    console.warn('⚠️ Push notifications no se pudieron activar');
                }
            }

            return registration;
        } catch (error) {
            console.warn('Service Worker no disponible:', error);
        }
    }
    return null;
}

/**
 * Maneja errores no capturados
 */
function configurarManejadorErrores() {
    window.onerror = (message, source, lineno, colno, error) => {
        console.error('Error no capturado:', { message, source, lineno, colno, error });
        return false;
    };

    window.onunhandledrejection = (event) => {
        console.error('Promesa rechazada no manejada:', event.reason);
    };
}

/**
 * Punto de entrada principal
 */
async function main() {
    // Log de inicio
    logInicio();

    // Verificar capacidades
    verificarCapacidades();

    // Configurar manejo de errores
    configurarManejadorErrores();

    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            await inicializarApp();
            await registrarServiceWorker();
        });
    } else {
        await inicializarApp();
        await registrarServiceWorker();
    }
}

// Iniciar aplicación
main().catch(error => {
    console.error('Error fatal al iniciar la aplicación:', error);
    document.getElementById('app').innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; text-align: center; padding: 2rem;">
      <h1 style="color: #ef4444; margin-bottom: 1rem;">❌ Error al cargar</h1>
      <p style="color: #64748b; max-width: 400px;">
        Hubo un problema al inicializar la aplicación. 
        Por favor, recargue la página o intente con otro navegador.
      </p>
      <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">
        Recargar
      </button>
    </div>
  `;
});
