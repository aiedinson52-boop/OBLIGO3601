/**
 * DeviceService.js
 * Servicio de detección de dispositivo y configuración de audio
 * para compatibilidad con Android Chrome e iOS Safari
 */

/**
 * Detecta el tipo de dispositivo
 * @returns {'android' | 'ios' | 'desktop'}
 */
export function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(ua)) {
        return 'ios';
    }
    if (ua.includes('android')) {
        return 'android';
    }
    return 'desktop';
}

/**
 * Detecta el navegador
 * @returns {'safari' | 'chrome' | 'firefox' | 'edge' | 'other'}
 */
export function detectBrowser() {
    const ua = navigator.userAgent.toLowerCase();

    if (ua.includes('safari') && !ua.includes('chrome')) {
        return 'safari';
    }
    if (ua.includes('edg')) {
        return 'edge';
    }
    if (ua.includes('chrome')) {
        return 'chrome';
    }
    if (ua.includes('firefox')) {
        return 'firefox';
    }
    return 'other';
}

/**
 * Verifica si estamos en un WebView
 * @returns {boolean}
 */
export function isWebView() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('wv') || ua.includes('webview');
}

/**
 * Obtiene la configuración de audio óptima para el dispositivo
 * @returns {Object} Configuración de MediaRecorder
 */
export function getAudioConfig() {
    const device = detectDevice();
    const browser = detectBrowser();

    // Configuración base
    const baseConfig = {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    };

    // iOS Safari: requiere audio/mp4 con codec AAC
    if (device === 'ios' || browser === 'safari') {
        return {
            ...baseConfig,
            mimeType: getSupportedMimeType(['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']),
            audioBitsPerSecond: 128000
        };
    }

    // Android Chrome: audio/webm con opus es óptimo
    if (device === 'android') {
        return {
            ...baseConfig,
            mimeType: getSupportedMimeType(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']),
            audioBitsPerSecond: 128000
        };
    }

    // Desktop: preferir webm con opus
    return {
        ...baseConfig,
        mimeType: getSupportedMimeType(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']),
        audioBitsPerSecond: 128000
    };
}

/**
 * Obtiene el primer MIME type soportado de la lista
 * @param {string[]} mimeTypes - Lista de MIME types a probar
 * @returns {string} MIME type soportado
 */
function getSupportedMimeType(mimeTypes) {
    if (typeof MediaRecorder === 'undefined') {
        return mimeTypes[0];
    }

    for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            console.log(`[DeviceService] MIME type soportado: ${mimeType}`);
            return mimeType;
        }
    }

    console.warn('[DeviceService] Ningún MIME type preferido soportado, usando default');
    return '';
}

/**
 * Obtiene el modo de voz recomendado
 * @returns {'streaming'} Siempre streaming (WebSocket)
 */
export function getRecommendedVoiceMode() {
    // Siempre usar streaming con backend STT
    return 'streaming';
}

/**
 * Configura automáticamente el modo de voz si no hay preferencia guardada
 */
export function autoConfigureVoiceMode() {
    const currentMode = localStorage.getItem('voice_mode');

    if (!currentMode) {
        const device = detectDevice();
        // Guardar dispositivo detectado para feedback en UI
        localStorage.setItem('detected_device', device);
        localStorage.setItem('voice_mode', 'streaming');
        console.log(`[DeviceService] Auto-configurado: device=${device}, mode=streaming`);
    }
}

/**
 * Obtiene información completa del dispositivo
 * @returns {Object}
 */
export function getDeviceInfo() {
    return {
        device: detectDevice(),
        browser: detectBrowser(),
        isWebView: isWebView(),
        audioConfig: getAudioConfig(),
        voiceMode: getRecommendedVoiceMode(),
        userAgent: navigator.userAgent
    };
}

/**
 * Verifica si MediaRecorder está disponible
 * @returns {boolean}
 */
export function isMediaRecorderSupported() {
    return typeof MediaRecorder !== 'undefined' &&
        typeof navigator.mediaDevices !== 'undefined' &&
        typeof navigator.mediaDevices.getUserMedia === 'function';
}
