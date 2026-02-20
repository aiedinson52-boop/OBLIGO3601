import { auth, db } from '../config/firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from 'firebase/auth';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    getDoc,
    setDoc,
    serverTimestamp
} from 'firebase/firestore';
import { inicializarVoz, iniciarEscucha, detenerEscucha, alternarEscucha, estaEscuchando, hablar } from '../services/VoiceService.js';
import { calcularAlertas } from '../models/Task.js';

// Variable para el usuario actual
let currentUser = null;


// ============================================================================
// ESTADO GLOBAL Y CONSTANTES
// ============================================================================

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_SEMANA_COMPLETO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Festivos colombianos
const FESTIVOS_FIJOS = [
    { mes: 1, dia: 1, nombre: 'Año Nuevo' },
    { mes: 5, dia: 1, nombre: 'Día del Trabajo' },
    { mes: 7, dia: 20, nombre: 'Día de la Independencia' },
    { mes: 8, dia: 7, nombre: 'Batalla de Boyacá' },
    { mes: 12, dia: 8, nombre: 'Inmaculada Concepción' },
    { mes: 12, dia: 25, nombre: 'Navidad' }
];

const FESTIVOS_EMILIANI = [
    { mes: 1, dia: 6, nombre: 'Día de los Reyes Magos' },
    { mes: 3, dia: 19, nombre: 'Día de San José' },
    { mes: 6, dia: 29, nombre: 'San Pedro y San Pablo' },
    { mes: 8, dia: 15, nombre: 'Asunción de la Virgen' },
    { mes: 10, dia: 12, nombre: 'Día de la Raza' },
    { mes: 11, dia: 1, nombre: 'Día de Todos los Santos' },
    { mes: 11, dia: 11, nombre: 'Independencia de Cartagena' }
];

// Estado global
const appState = {
    year: 2026,
    month: 1, // Febrero
    selectedDate: null,
    tareas: [],
    isListening: false
};

// ============================================================================
// SISTEMA DE AUTENTICACIÓN
// ============================================================================


export async function registrarUsuario(email, password, nombre) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: nombre });

        await setDoc(doc(db, 'users', userCredential.user.uid), {
            nombre: nombre,
            email: email,
            fechaCreacion: serverTimestamp()
        });

        console.log('✅ Usuario registrado:', email);
        return userCredential.user;
    } catch (error) {
        console.error('Error en registro:', error);
        throw traducirErrorFirebase(error);
    }
}

export async function iniciarSesion(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Sesión iniciada:', email);
        return userCredential.user;
    } catch (error) {
        console.error('Error en login:', error);
        throw traducirErrorFirebase(error);
    }
}

export async function cerrarSesion() {
    try {
        await signOut(auth);
        currentUser = null;
        appState.tareas = [];
        suscripcionCache = null;
        console.log('✅ Sesión cerrada');
        if (typeof renderizarLogin === 'function') renderizarLogin();
    } catch (error) {
        console.error('Error cerrando sesión:', error);
    }
}

function traducirErrorFirebase(error) {
    const errores = {
        'auth/email-already-in-use': 'Este correo ya está registrado',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/operation-not-allowed': 'Operación no permitida',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
        'auth/user-not-found': 'No existe cuenta con este correo',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/too-many-requests': 'Demasiados intentos. Intente más tarde',
        'auth/network-request-failed': 'Error de conexión. Verifique su internet'
    };
    return new Error(errores[error.code] || error.message);
}

// ============================================================================
// ALMACENAMIENTO DE TAREAS EN FIRESTORE
// ============================================================================

let unsubscribeTareas = null;

function iniciarListenerTareas() {
    if (!currentUser) return;
    if (unsubscribeTareas) return;

    console.log('📡 Iniciando sincronización de tareas en tiempo real...');

    const q = query(collection(db, 'users', currentUser.uid, 'tasks'));

    unsubscribeTareas = onSnapshot(q, (snapshot) => {
        const tareas = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            tareas.push({ id: docSnap.id, ...data });
        });

        // Ordenar en memoria para evitar requerir índices de Firestore
        tareas.sort((a, b) => {
            const fechaA = new Date(a.fecha + 'T' + (a.hora || '00:00'));
            const fechaB = new Date(b.fecha + 'T' + (b.hora || '00:00'));
            return fechaA - fechaB;
        });

        appState.tareas = tareas;
        console.log(`🔄 Sincronización: ${tareas.length} tareas actualizadas`);

        if (typeof renderizarCalendario === 'function') renderizarCalendario();
        if (typeof renderizarListaTareas === 'function') renderizarListaTareas();
        if (typeof renderizarTareasPendientes === 'function') renderizarTareasPendientes();
        if (typeof renderizarTareasCumplidas === 'function') renderizarTareasCumplidas();

        if (window.checkAlarms) checkAlarms();
    }, (error) => {
        console.error('❌ Error en sincronización de tareas:', error);
        console.error('Código:', error.code, '| Mensaje:', error.message);
        if (error.code === 'permission-denied') {
            mostrarToast('⚠️ Permisos denegados. Configure las reglas de Firestore.', 'error');
        } else {
            mostrarToast('Error de sincronización: ' + error.message, 'error');
        }
    });
}

function detenerListenerTareas() {
    if (unsubscribeTareas) {
        unsubscribeTareas();
        unsubscribeTareas = null;
        console.log('🛑 Sincronización detenida');
    }
}

async function cargarTareasFirestore() {
    iniciarListenerTareas();
    return [];
}

async function agregarTarea(tarea) {
    if (!currentUser) {
        mostrarToast('Debe iniciar sesión para guardar tareas', 'warning');
        return;
    }

    console.log('[SAVE] ▶ Iniciando guardado de tarea (Module):', tarea.titulo || '(sin título)');

    try {
        const fechaTarea = tarea.fecha || new Date().toISOString().split('T')[0];
        const horaTarea = tarea.hora || '09:00';
        const alertas = calcularAlertas(fechaTarea, horaTarea);
        const nuevaTarea = {
            titulo: tarea.titulo || 'Sin título',
            fecha: fechaTarea,
            hora: horaTarea,
            contexto: tarea.contexto || 'personal',
            prioridad: tarea.prioridad || 'media',
            estado: tarea.estado || 'Pendiente',
            alertas: alertas,
            creadaEn: serverTimestamp(),
            email: currentUser.email
        };

        // Retry logic
        const MAX_RETRIES = 3;
        const BACKOFF_MS = [500, 1000, 2000];

        for (let intento = 1; intento <= MAX_RETRIES; intento++) {
            try {
                console.log(`[SAVE] 🔄 Intento ${intento}/${MAX_RETRIES} - Guardando en Firestore...`);
                await addDoc(collection(db, 'users', currentUser.uid, 'tasks'), nuevaTarea);
                console.log(`[SAVE] ✅ Tarea guardada en Firestore (Intento ${intento})`);
                return;
            } catch (error) {
                console.error(`[SAVE] ❌ Intento ${intento}/${MAX_RETRIES} falló:`, error.code);
                if (error.code === 'permission-denied' || error.code === 'unauthenticated') throw error;
                if (intento < MAX_RETRIES) await new Promise(r => setTimeout(r, BACKOFF_MS[intento - 1]));
            }
        }

        throw new Error('deadline-exceeded'); // Trigger catch for fallback

    } catch (error) {
        console.error('Error guardando tarea:', error);

        if (error.code === 'permission-denied') {
            mostrarToast('⚠️ Error de permisos: No autorizado', 'error');
        } else {
            // Saving via TaskStorage logic would go here if this file was fully integrated
            // For now, just show the warning as this seems to be a WIP file
            mostrarToast('⚠️ Error de conexión. Guardado pendiente (Simulado)', 'warning');
        }
    }
}

async function actualizarTarea(id, cambios) {
    if (!currentUser || !id) return;
    try {
        // Si se modifica fecha u hora, recalcular alertas
        if (cambios.fecha || cambios.hora) {
            const taskRef = doc(db, 'users', currentUser.uid, 'tasks', id);
            const tareaDoc = await getDoc(taskRef);

            if (tareaDoc.exists()) {
                const tareaActual = tareaDoc.data();
                const nuevaFecha = cambios.fecha || tareaActual.fecha;
                const nuevaHora = cambios.hora || tareaActual.hora;
                cambios.alertas = calcularAlertas(nuevaFecha, nuevaHora);
                console.log('[asistente] Alertas recalculadas para nueva fecha/hora:', nuevaFecha, nuevaHora);
            }
        }

        const taskRef = doc(db, 'users', currentUser.uid, 'tasks', id);
        await updateDoc(taskRef, cambios);
        console.log(`✅ Tarea actualizada: ${id}`);
    } catch (error) {
        console.error('Error actualizando tarea:', error);
        mostrarToast('Error al actualizar la tarea', 'error');
    }
}

async function eliminarTareaById(id) {
    if (!currentUser || !id) return;
    try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'tasks', id));
        console.log(`🗑️ Tarea eliminada: ${id}`);
    } catch (error) {
        console.error('Error eliminando tarea:', error);
        mostrarToast('Error al eliminar la tarea', 'error');
    }
}

async function migrarTareasLocales() {
    if (!db || !currentUser) return;
    const tareasLocales = JSON.parse(localStorage.getItem('tareasObligo360') || '[]');
    if (tareasLocales.length === 0) return;
    console.log(`📤 Migrando ${tareasLocales.length} tareas locales a la nube...`);
    for (const tarea of tareasLocales) {
        await agregarTarea(tarea);
    }
    localStorage.removeItem('tareasObligo360');
    mostrarToast(`✅ ${tareasLocales.length} tareas migradas a tu cuenta`, 'success');
}

// ============================================================================
// RENDERIZADO
// ============================================================================

function renderizarLogin() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: var(--space-4);">
            <div style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); border-radius: var(--radius-2xl); border: 1px solid var(--glass-border); box-shadow: var(--shadow-xl); padding: var(--space-8); max-width: 420px; width: 100%;">
                <div style="text-align: center; margin-bottom: var(--space-6);">
                    <img src="/logo-obligo360.png" alt="Obligo360" style="height: 60px; margin-bottom: var(--space-4);">
                    <h1 style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Bienvenido</h1>
                    <p style="color: var(--color-gray-500); font-size: var(--font-size-sm); margin-top: var(--space-2);">Tu asistente para cumplir sin estrés</p>
                </div>
                <div id="auth-form-container">${renderizarFormularioLogin()}</div>
                <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-gray-200); text-align: center;">
                    <p id="auth-toggle-text" style="color: var(--color-gray-500); font-size: var(--font-size-sm);">
                        ¿No tienes cuenta? <a href="#" onclick="toggleAuthForm('register'); return false;" style="color: var(--color-primary-500); font-weight: var(--font-weight-semibold); text-decoration: none;">Regístrate</a>
                    </p>
                </div>
                <!-- Firebase siempre configurado vía config/firebase.js -->
            </div>
        </div>
    `;
}

function renderizarFormularioLogin() {
    return `
        <form id="login-form" onsubmit="window.handleLogin(event)">
            <div class="form-group"><label class="form-label" for="login-email">Correo</label><input type="email" id="login-email" class="form-input" required></div>
            <div class="form-group"><label class="form-label" for="login-password">Contraseña</label><input type="password" id="login-password" class="form-input" required minlength="6"></div>
            <div id="login-error" style="display: none; color: var(--color-danger); padding: 5px;"></div>
            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 10px;" id="login-btn">Iniciar Sesión</button>
        </form>
    `;
}

function renderizarFormularioRegistro() {
    return `
        <form id="register-form" onsubmit="window.handleRegister(event)">
            <div class="form-group"><label class="form-label" for="register-name">Nombre</label><input type="text" id="register-name" class="form-input" required></div>
            <div class="form-group"><label class="form-label" for="register-email">Correo</label><input type="email" id="register-email" class="form-input" required></div>
            <div class="form-group"><label class="form-label" for="register-password">Contraseña</label><input type="password" id="register-password" class="form-input" required minlength="6"></div>
            <div class="form-group"><label class="form-label" for="register-confirm">Confirmar</label><input type="password" id="register-confirm" class="form-input" required minlength="6"></div>
            <div id="register-error" style="display: none; color: var(--color-danger); padding: 5px;"></div>
            <button type="submit" class="btn btn-primary" style="width: 100%; padding: 10px;" id="register-btn">Crear Cuenta</button>
        </form>
    `;
}

window.toggleAuthForm = function (mode) {
    const container = document.getElementById('auth-form-container');
    const toggleText = document.getElementById('auth-toggle-text');
    if (mode === 'register') {
        container.innerHTML = renderizarFormularioRegistro();
        toggleText.innerHTML = `¿Ya tienes cuenta? <a href="#" onclick="toggleAuthForm('login'); return false;" style="color: var(--color-primary-500); font-weight: 600; text-decoration: none;">Inicia sesión</a>`;
    } else {
        container.innerHTML = renderizarFormularioLogin();
        toggleText.innerHTML = `¿No tienes cuenta? <a href="#" onclick="toggleAuthForm('register'); return false;" style="color: var(--color-primary-500); font-weight: 600; text-decoration: none;">Regístrate</a>`;
    }
}

window.handleLogin = async function (event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btnEl = document.getElementById('login-btn');
    errorEl.style.display = 'none';
    btnEl.disabled = true;
    try {
        await iniciarSesion(email, password);
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        btnEl.disabled = false;
    }
}

window.handleRegister = async function (event) {
    event.preventDefault();
    const nombre = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('register-error');
    const btnEl = document.getElementById('register-btn');
    if (password !== confirm) {
        errorEl.textContent = 'Las contraseñas no coinciden';
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';
    btnEl.disabled = true;
    try {
        await registrarUsuario(email, password, nombre);
        mostrarToast('¡Cuenta creada exitosamente!', 'success');
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        btnEl.disabled = false;
    }
}

// ============================================================================
// HORA Y SINCRONIZACIÓN
// ============================================================================

let timeOffset = 0;
let isSynced = false;
let lastSyncTime = 0;
const SYNC_INTERVAL = 5 * 60 * 1000;

async function sincronizarHoraOficial() {
    try {
        const response = await fetch('https://worldtimeapi.org/api/timezone/America/Bogota');
        if (!response.ok) throw new Error('Error de red');
        const data = await response.json();
        const serverTime = data.unixtime * 1000;
        const localTime = Date.now();
        timeOffset = serverTime - localTime;
        isSynced = true;
        lastSyncTime = localTime;
        console.log('✅ Hora Legal de Colombia sincronizada');
        return true;
    } catch (error) {
        console.error('❌ Error sincronizando hora:', error);
        isSynced = false;
        return false;
    }
}

function obtenerHoraColombiana() {
    if (isSynced) return new Date(Date.now() + timeOffset);
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (-5 * 60 * 60 * 1000));
}

// ============================================================================
// SUSCRIPCIÓN
// ============================================================================

const SUBSCRIPTION_DAYS = 30;
let suscripcionCache = null;

async function cargarSuscripcionFirestore() {
    if (!db || !currentUser) return null;
    try {
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (docSnap.exists()) {
            suscripcionCache = docSnap.data().suscripcion || null;
            return suscripcionCache;
        }
    } catch (error) { console.error(error); }
    return null;
}

async function guardarSuscripcionFirestore(suscripcion) {
    if (!db || !currentUser) return false;
    try {
        await setDoc(doc(db, 'users', currentUser.uid), { suscripcion }, { merge: true });
        suscripcionCache = suscripcion;
        return true;
    } catch (error) { console.error(error); return false; }
}

function verificarSuscripcion() {
    if (!suscripcionCache || !suscripcionCache.activa) return false;
    const ahora = obtenerHoraColombiana();
    const expiracion = new Date(suscripcionCache.fechaExpiracion);
    return ahora < expiracion;
}

async function activarSuscripcion() {
    const ahora = obtenerHoraColombiana();
    const expiracion = new Date(ahora);
    expiracion.setDate(expiracion.getDate() + SUBSCRIPTION_DAYS);
    const suscripcion = {
        activa: true,
        fechaActivacion: ahora.toISOString(),
        fechaExpiracion: expiracion.toISOString(),
        email: currentUser ? currentUser.email : 'anónimo'
    };
    if (await guardarSuscripcionFirestore(suscripcion)) {
        actualizarEstadoBotonVoz();
        mostrarToast(`¡Suscripción activada! Válida hasta ${expiracion.toLocaleDateString('es-CO')}`, 'success');
    } else {
        mostrarToast('Error activando suscripción', 'error');
    }
}

function obtenerDiasRestantes() {
    if (!suscripcionCache || !suscripcionCache.fechaExpiracion) return 0;
    const ahora = obtenerHoraColombiana();
    const expiracion = new Date(suscripcionCache.fechaExpiracion);
    const diff = expiracion - ahora;
    return diff <= 0 ? 0 : Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function actualizarEstadoBotonVoz() {
    const voiceBtn = document.getElementById('voice-button');
    const voiceLabel = document.getElementById('voice-label');
    const activo = verificarSuscripcion();
    if (!voiceBtn) return;

    if (activo) {
        const dias = obtenerDiasRestantes();
        voiceBtn.disabled = false;
        voiceBtn.style.opacity = '1';
        voiceBtn.style.cursor = 'pointer';
        if (voiceLabel) voiceLabel.innerHTML = `Control por Voz<br><span style="font-size: 9px; opacity: 0.8;">${dias} días</span>`;
    } else {
        voiceBtn.disabled = true;
        voiceBtn.style.opacity = '0.5';
        voiceBtn.style.cursor = 'not-allowed';
        if (voiceLabel) voiceLabel.innerHTML = `<span style="color: #fca5a5;">🔒 Bloqueado</span>`;
    }
    actualizarUISubscripcion();
}

function actualizarUISubscripcion() {
    const btnPagar = document.getElementById('btn-pagar');
    const statusSpan = document.getElementById('subscription-status');
    const activo = verificarSuscripcion();
    if (activo) {
        if (btnPagar) btnPagar.style.display = 'none';
        if (statusSpan) statusSpan.innerHTML = `<span style="background: rgba(34, 197, 94, 0.2); padding: 4px 12px; border-radius: 12px;">✅ Suscripción activa</span>`;
    } else {
        if (btnPagar) btnPagar.style.display = 'inline-flex';
        if (statusSpan) statusSpan.textContent = '';
    }
}

let ventanaPago = null;
window.abrirPago = function () {
    const PAYMENT_URL = 'https://checkout.bold.co/payment/LNK_33WYRIPV32';
    ventanaPago = window.open(PAYMENT_URL, 'PagoBold', 'width=600,height=700,scrollbars=yes,resizable=yes');
    mostrarToast('Se abrió la ventana de pago.', 'info');
    const check = setInterval(() => {
        if (ventanaPago && ventanaPago.closed) {
            clearInterval(check);
            setTimeout(() => {
                if (confirm('¿Completó el pago exitosamente?')) {
                    activarSuscripcion();
                    hablar('Suscripción activada');
                }
            }, 500);
        }
    }, 1000);
}

function detectarRetornoPago() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        window.history.replaceState({}, document.title, window.location.pathname);
        activarSuscripcion();
    }
}

function iniciarVerificacionSuscripcion() {
    actualizarEstadoBotonVoz();
    setInterval(async () => {
        if (currentUser) await cargarSuscripcionFirestore();
        actualizarEstadoBotonVoz();
    }, 60000);
}

// ============================================================================
// CALCULOS FECHAS
// ============================================================================

function calcularPascua(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function trasladarAlLunes(fecha) {
    const dia = fecha.getDay();
    if (dia === 1) return new Date(fecha);
    const diasHasta = dia === 0 ? 1 : 8 - dia;
    const nueva = new Date(fecha);
    nueva.setDate(nueva.getDate() + diasHasta);
    return nueva;
}

function agregarDias(fecha, dias) { const n = new Date(fecha); n.setDate(n.getDate() + dias); return n; }

function obtenerFestivos(year) {
    const festivos = [];
    FESTIVOS_FIJOS.forEach(f => festivos.push({ fecha: new Date(year, f.mes - 1, f.dia), nombre: f.nombre }));
    FESTIVOS_EMILIANI.forEach(f => festivos.push({ fecha: trasladarAlLunes(new Date(year, f.mes - 1, f.dia)), nombre: f.nombre }));
    const pascua = calcularPascua(year);
    festivos.push({ fecha: agregarDias(pascua, -3), nombre: 'Jueves Santo' });
    festivos.push({ fecha: agregarDias(pascua, -2), nombre: 'Viernes Santo' });
    festivos.push({ fecha: trasladarAlLunes(agregarDias(pascua, 39)), nombre: 'Ascensión del Señor' });
    festivos.push({ fecha: trasladarAlLunes(agregarDias(pascua, 60)), nombre: 'Corpus Christi' });
    festivos.push({ fecha: trasladarAlLunes(agregarDias(pascua, 68)), nombre: 'Sagrado Corazón' });
    return festivos;
}

function esFestivo(fecha, festivos) {
    return festivos.find(f => f.fecha.getFullYear() === fecha.getFullYear() && f.fecha.getMonth() === fecha.getMonth() && f.fecha.getDate() === fecha.getDate());
}

// ============================================================================
// UI RENDERING
// ============================================================================

window.renderizarApp = function () {
    const app = document.getElementById('app');
    if (!app) return;
    const hoy = new Date();
    const fechaString = `${DIAS_SEMANA_COMPLETO[hoy.getDay()]}, ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;

    app.innerHTML = `
        <div class="app-container" style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: 'Inter', sans-serif;">
            <header class="app-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
                <div class="logo-section" style="display: flex; align-items: center; gap: 15px;">
                    <img src="/logo-obligo360.png" alt="Obligo360" style="height: 50px;">
                    <div><h1 style="margin: 0; font-size: 1.5rem; color: #1f2937;">Asistente Personal</h1><p style="margin: 0; color: #6b7280; font-size: 0.9rem;">${fechaString}</p></div>
                </div>
                <div class="user-controls" style="display: flex; gap: 15px; align-items: center;">
                    <div id="subscription-badge" style="display: none;">PREMIUM</div>
                    <button id="btn-pagar" onclick="abrirPago()" class="btn-subscribe" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Gestionar Suscripción</button>
                    <span id="subscription-status"></span>
                    <button onclick="cerrarSesion()" style="background: transparent; border: 1px solid #d1d5db; padding: 8px 16px; border-radius: 6px; cursor: pointer; color: #374151;">Salir</button>
                </div>
            </header>
            <main style="display: grid; grid-template-columns: 1fr 350px; gap: 30px;">
                <section class="left-column">
                    <div class="calendar-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 id="calendar-month-title" style="margin: 0; font-size: 1.25rem;"></h2>
                        <div class="calendar-nav">
                            <button onclick="cambiarMes(-1)" style="border: none; background: transparent; cursor: pointer; font-size: 1.2rem;">◀</button>
                            <button onclick="cambiarMes(1)" style="border: none; background: transparent; cursor: pointer; font-size: 1.2rem;">▶</button>
                        </div>
                    </div>
                    <div id="calendar-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 30px;"></div>
                    <div class="tasks-container">
                        <h3 style="font-size: 1.1rem; margin-bottom: 15px; border-left: 4px solid #4f46e5; padding-left: 10px;">Tareas para el <span id="selected-date-label">día</span></h3>
                        <ul id="lista-tareas" style="list-style: none; padding: 0; margin: 0;"></ul>
                    </div>
                    
                    <!-- Todas las Tareas Pendientes -->
                    <div style="margin-top: 30px;">
                        <h3 style="font-size: 1.1rem; margin-bottom: 15px; border-left: 4px solid #f59e0b; padding-left: 10px;">📋 Todas las Tareas Pendientes</h3>
                        <div id="todas-pendientes" style="max-height: 400px; overflow-y: auto; scrollbar-width: thin;"></div>
                    </div>
                    
                    <!-- Tareas Cumplidas -->
                    <div style="margin-top: 30px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h3 style="font-size: 1.1rem; border-left: 4px solid #10b981; padding-left: 10px; margin: 0;">✅ Tareas Cumplidas</h3>
                            <button onclick="exportarExcelCumplidas()" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">📥 Descargar Excel</button>
                        </div>
                        <div id="lista-cumplidas" style="max-height: 400px; overflow-y: auto; scrollbar-width: thin;"></div>
                    </div>
                </section>
                <section class="right-column" style="background: #f9fafb; padding: 25px; border-radius: 12px; height: fit-content; position: sticky; top: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div id="voice-button" onclick="toggleVoice()" style="width: 80px; height: 80px; background: #ef4444; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease;">
                            <span style="font-size: 2rem;">🎙️</span>
                        </div>
                        <p id="voice-status" style="margin-top: 15px; color: #4b5563; font-weight: 500;">Toque para hablar</p>
                    </div>
                    <div id="transcript-container" style="background: white; padding: 15px; border-radius: 8px; min-height: 100px; border: 1px solid #e5e7eb;">
                        <div id="transcript-header" style="display: none; color: #4f46e5; font-size: 0.8rem; font-weight: bold; margin-bottom: 5px;">ESCUCHANDO...</div>
                        <div id="transcript" style="color: #374151;"></div>
                    </div>
                </section>
            </main>
        </div>
    `;

    if (!appState.selectedDate) appState.selectedDate = new Date().toISOString().split('T')[0];
    renderizarCalendario();
    renderizarListaTareas();
    renderizarTareasPendientes();
    renderizarTareasCumplidas();

    // Inicializar Voz usando VoiceService (nueva implementación)
    inicializarReconocimiento();
}

window.cambiarMes = function (delta) {
    appState.month += delta;
    if (appState.month > 11) { appState.month = 0; appState.year++; }
    else if (appState.month < 0) { appState.month = 11; appState.year--; }
    renderizarCalendario();
}

window.seleccionarFecha = function (fechaStr) {
    appState.selectedDate = fechaStr;
    renderizarCalendario();
    renderizarListaTareas();
}

function renderizarCalendario() {
    const grid = document.getElementById('calendar-grid');
    const titulo = document.getElementById('calendar-month-title');
    if (!grid || !titulo) return;

    const mes = appState.month;
    const anio = appState.year;
    titulo.textContent = `${MESES[mes]} ${anio}`;
    grid.innerHTML = '';

    ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].forEach(dia => {
        const el = document.createElement('div');
        el.textContent = dia;
        el.style.textAlign = 'center';
        el.style.fontWeight = 'bold';
        el.style.color = '#9ca3af';
        el.style.fontSize = '0.85rem';
        grid.appendChild(el);
    });

    const primerDia = new Date(anio, mes, 1).getDay();
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const festivos = obtenerFestivos(anio);

    for (let i = 0; i < primerDia; i++) grid.appendChild(document.createElement('div'));

    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fechaStr = `${anio}-${(mes + 1).toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
        const esHoy = fechaStr === new Date().toISOString().split('T')[0];
        const esSeleccionado = appState.selectedDate === fechaStr;
        const diaFestivo = esFestivo(new Date(anio, mes, dia), festivos);
        const tieneTareas = appState.tareas.some(t => t.fecha === fechaStr && t.estado !== 'Cumplida');

        const el = document.createElement('div');
        el.style.aspectRatio = '1';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.cursor = 'pointer';
        el.style.borderRadius = '50%';
        el.style.position = 'relative';
        el.onclick = () => seleccionarFecha(fechaStr);

        let bg = 'transparent';
        let color = '#374151';

        if (esHoy) { bg = '#dbeafe'; color = '#1e40af'; }
        if (esSeleccionado) { bg = '#4f46e5'; color = 'white'; }
        if (!esSeleccionado && diaFestivo) { color = '#dc2626'; }

        el.style.background = bg;
        el.style.color = color;
        el.textContent = dia;

        if (tieneTareas) {
            const dot = document.createElement('div');
            dot.style.width = '4px';
            dot.style.height = '4px';
            dot.style.background = esSeleccionado ? 'white' : '#ef4444';
            dot.style.borderRadius = '50%';
            dot.style.position = 'absolute';
            dot.style.bottom = '4px';
            el.appendChild(dot);
        }
        grid.appendChild(el);
    }
}

function renderizarListaTareas() {
    const lista = document.getElementById('lista-tareas');
    const label = document.getElementById('selected-date-label');
    if (!lista) return;

    if (label && appState.selectedDate) {
        const parts = appState.selectedDate.split('-');
        label.textContent = `${parts[2]} de ${MESES[parseInt(parts[1]) - 1]}`;
    }

    lista.innerHTML = '';
    const tareasDia = appState.tareas.filter(t => t.fecha === appState.selectedDate && t.estado !== 'Cumplida');

    if (tareasDia.length === 0) {
        lista.innerHTML = '<li style="text-align: center; color: #9ca3af; padding: 20px;">No hay tareas para este día</li>';
        return;
    }

    tareasDia.forEach(t => {
        const li = document.createElement('li');
        li.style.background = 'white';
        li.style.padding = '15px';
        li.style.marginBottom = '10px';
        li.style.borderRadius = '8px';
        li.style.border = '1px solid #e5e7eb';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';

        // Prioridad color
        let borderLeft = '4px solid #9ca3af';
        if (t.prioridad === 'alta') borderLeft = '4px solid #ef4444';
        if (t.prioridad === 'baja') borderLeft = '4px solid #10b981';
        li.style.borderLeft = borderLeft;

        li.innerHTML = `
            <div>
                <strong style="display: block; color: #1f2937;">${t.titulo}</strong>
                <span style="font-size: 0.85rem; color: #6b7280;">${t.hora} (${t.contexto || 'general'})</span>
            </div>
            <div>
                <button onclick="marcarCumplida('${t.id}')" style="border: none; background: #d1fae5; color: #065f46; border-radius: 50%; width: 32px; height: 32px; cursor: pointer;">✓</button>
                <button onclick="eliminarTarea('${t.id}')" style="border: none; background: #fee2e2; color: #991b1b; border-radius: 50%; width: 32px; height: 32px; cursor: pointer;">✕</button>
            </div>
        `;
        lista.appendChild(li);
    });
}

// Renderizar TODAS las tareas pendientes
function renderizarTareasPendientes() {
    const container = document.getElementById('todas-pendientes');
    if (!container) return;

    const pendientes = appState.tareas
        .filter(t => t.estado !== 'Cumplida')
        .sort((a, b) => {
            const dateA = new Date(a.fecha + 'T' + (a.hora || '00:00'));
            const dateB = new Date(b.fecha + 'T' + (b.hora || '00:00'));
            return dateA - dateB;
        });

    if (pendientes.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">🎉 No hay tareas pendientes. ¡Excelente trabajo!</p>';
        return;
    }

    container.innerHTML = pendientes.map(t => {
        let borderColor = '#9ca3af';
        if (t.prioridad === 'alta') borderColor = '#ef4444';
        else if (t.prioridad === 'baja') borderColor = '#10b981';
        else if (t.prioridad === 'media') borderColor = '#f59e0b';

        const fechaObj = new Date(t.fecha + 'T12:00:00');
        const fechaStr = `${fechaObj.getDate()} de ${MESES[fechaObj.getMonth()]}`;
        const ahora = new Date();
        const diff = fechaObj - ahora;
        const diasRestantes = Math.ceil(diff / (1000 * 60 * 60 * 24));
        let tiempoTexto = '';
        if (diasRestantes < 0) tiempoTexto = '<span style="color: #ef4444; font-weight: bold;">⚠️ Vencida</span>';
        else if (diasRestantes === 0) tiempoTexto = '<span style="color: #f59e0b; font-weight: bold;">📌 Hoy</span>';
        else if (diasRestantes === 1) tiempoTexto = '<span style="color: #f59e0b;">Mañana</span>';
        else tiempoTexto = `<span style="color: #6b7280;">En ${diasRestantes} días</span>`;

        return `
            <div style="background: white; padding: 12px 15px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #e5e7eb; border-left: 4px solid ${borderColor}; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <strong style="display: block; color: #1f2937; font-size: 0.95rem;">${escapeHtml(t.titulo)}</strong>
                    <div style="font-size: 0.8rem; color: #6b7280; margin-top: 4px;">
                        📅 ${fechaStr} · 🕐 ${t.hora || '—'} · ${t.contexto || 'general'} · ${tiempoTexto}
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="marcarCumplida('${t.id}')" title="Marcar cumplida" style="border: none; background: #d1fae5; color: #065f46; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 0.9rem;">✓</button>
                    <button onclick="eliminarTarea('${t.id}')" title="Eliminar" style="border: none; background: #fee2e2; color: #991b1b; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 0.9rem;">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

// Renderizar tareas cumplidas
function renderizarTareasCumplidas() {
    const container = document.getElementById('lista-cumplidas');
    if (!container) return;

    const cumplidas = appState.tareas
        .filter(t => t.estado === 'Cumplida')
        .sort((a, b) => {
            const dateA = new Date(a.actualizadaEn || a.fecha);
            const dateB = new Date(b.actualizadaEn || b.fecha);
            return dateB - dateA;
        });

    if (cumplidas.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">No hay tareas cumplidas aún.</p>';
        return;
    }

    container.innerHTML = cumplidas.map(t => {
        const fechaObj = new Date(t.fecha + 'T12:00:00');
        const fechaStr = `${fechaObj.getDate()} de ${MESES[fechaObj.getMonth()]}`;
        return `
            <div style="background: #f0fdf4; padding: 10px 15px; margin-bottom: 6px; border-radius: 8px; border-left: 3px solid #10b981; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <span style="text-decoration: line-through; color: #6b7280;">${escapeHtml(t.titulo)}</span>
                    <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 2px;">📅 ${fechaStr} · 🕐 ${t.hora || '—'}</div>
                </div>
                <button onclick="restaurarTarea('${t.id}')" title="Restaurar a pendientes" style="border: none; background: #e0e7ff; color: #4338ca; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 0.8rem;">↩️ Restaurar</button>
            </div>
        `;
    }).join('');
}

// Función para escapar HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ============================================================================
// FUNCIONES DE TAREAS
// ============================================================================

window.marcarCumplida = function (id) {
    actualizarTarea(id, { estado: 'Cumplida' });
    hablar('Tarea marcada como cumplida');
}

window.restaurarTarea = function (id) {
    actualizarTarea(id, { estado: 'Pendiente' });
    hablar('Tarea restaurada a pendientes');
}

window.eliminarTarea = function (id) {
    mostrarDialogoContrasena(function () {
        eliminarTareaById(id);
        hablar('Tarea eliminada');
    });
}

// Diálogo de contraseña para eliminar
function mostrarDialogoContrasena(onSuccess) {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);';

    const modal = document.createElement('div');
    modal.style.cssText = 'background: white; border-radius: 16px; padding: 24px; max-width: 380px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);';
    modal.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 1.1rem;">🔒 Confirmar Eliminación</h3>
        <p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 16px;">Ingrese la contraseña para eliminar esta tarea</p>
        <input type="password" id="delete-password" placeholder="Contraseña" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; margin-bottom: 12px; box-sizing: border-box;">
        <p id="password-error" style="color: #ef4444; font-size: 0.8rem; display: none; margin-bottom: 8px;">❌ Contraseña incorrecta</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancel-delete" style="background: #f3f4f6; color: #374151; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Cancelar</button>
            <button id="confirm-delete" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Eliminar</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const input = modal.querySelector('#delete-password');
    const errorMsg = modal.querySelector('#password-error');
    input.focus();

    modal.querySelector('#confirm-delete').addEventListener('click', () => {
        if (input.value === 'controltotal') {
            document.body.removeChild(overlay);
            onSuccess();
        } else {
            errorMsg.style.display = 'block';
            input.value = '';
            input.focus();
            input.style.borderColor = '#ef4444';
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') modal.querySelector('#confirm-delete').click();
    });

    modal.querySelector('#cancel-delete').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) document.body.removeChild(overlay);
    });
}

// Exportar tareas cumplidas a Excel
window.exportarExcelCumplidas = function () {
    const cumplidas = appState.tareas.filter(t => t.estado === 'Cumplida');
    if (cumplidas.length === 0) {
        mostrarToast('No hay tareas cumplidas para exportar', 'info');
        return;
    }

    // Generar CSV como fallback (no requiere librería externa)
    const headers = ['Titulo', 'Fecha', 'Hora', 'Prioridad', 'Contexto', 'Estado'];
    const rows = cumplidas.map(t => [
        '"' + (t.titulo || '').replace(/"/g, '""') + '"',
        t.fecha || '',
        t.hora || '',
        t.prioridad || '',
        t.contexto || '',
        t.estado || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tareas_cumplidas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('Archivo exportado exitosamente', 'success');
}

// ============================================================================
// VOICE INTEGRATION (VoiceService)
// ============================================================================

function inicializarReconocimiento() {
    console.log('🎙️ Inicializando VoiceService...');
    inicializarVoz({
        onResult: (data) => {
            const transcriptDisplay = document.getElementById('transcript');
            if (transcriptDisplay) {
                transcriptDisplay.textContent = data.final || data.interim;
            }
            if (data.isFinal && data.final) {
                console.log('📝 Transcripción final:', data.final);
                procesarTranscripcion(data.final);
            }
        },
        onError: (err) => {
            console.error('Error voz:', err);
            mostrarToast(err, 'error');
            actualizarEstadoUI(false);
        },
        onStatusChange: (status) => {
            console.log('Estado voz:', status);
            const isListening = (status === 'listening');
            appState.isListening = isListening;
            actualizarEstadoUI(isListening);
        }
    });
}

window.toggleVoice = function () {
    if (!verificarSuscripcion()) {
        mostrarToast('Suscripción requerida para usar la voz', 'warning');
        return;
    }
    alternarEscucha();
}

function actualizarEstadoUI(isListening) {
    const voiceBtn = document.getElementById('voice-button');
    const voiceStatus = document.getElementById('voice-status');
    const transcriptHeader = document.getElementById('transcript-header');

    if (!voiceBtn) return;

    if (isListening) {
        voiceBtn.style.background = '#22c55e'; // Green
        voiceBtn.style.animation = 'pulse 1.5s infinite';
        if (voiceStatus) voiceStatus.textContent = 'Escuchando...';
        if (transcriptHeader) transcriptHeader.style.display = 'block';
    } else {
        voiceBtn.style.background = '#ef4444'; // Red
        voiceBtn.style.animation = 'none';
        if (voiceStatus) voiceStatus.textContent = 'Toque para hablar';
        if (transcriptHeader) transcriptHeader.style.display = 'none';
    }
}

// ============================================================================
// PROCESAMIENTO COMANDOS
// ============================================================================

function procesarTranscripcion(texto) {
    texto = texto.toLowerCase().trim();
    if (!texto) return;

    // Patrones simples (Legacy) - Se podrían mejorar con VoiceService.identificarComando
    if (texto.includes('crear tarea') || texto.includes('nueva tarea') || texto.includes('recordar')) {
        const desc = texto.replace(/crear tarea|nueva tarea|recordar/gi, '').trim();
        if (desc) {
            mostrarConfirmacion(desc);
            hablar(`¿Confirmas crear la tarea: ${desc}?`);
        } else {
            hablar('¿Qué tarea quieres crear?');
        }
    } else if (texto.includes('ver tareas') || texto.includes('mis tareas')) {
        hablar(`Tienes ${appState.tareas.filter(t => t.estado !== 'Cumplida').length} tareas pendientes.`);
    } else if (texto.includes('hora')) {
        const now = obtenerHoraColombiana();
        hablar(`Son las ${now.getHours()} y ${now.getMinutes()}`);
    } else {
        // Asumir creación de tarea por defecto si es largo
        if (texto.length > 5) {
            mostrarConfirmacion(texto);
            hablar(`¿Confirmas crear la tarea: ${texto}?`);
        }
    }
}

function mostrarConfirmacion(titulo) {
    if (confirm(`¿Crear tarea: "${titulo}"?`)) {
        agregarTarea({
            titulo: titulo,
            fecha: appState.selectedDate,
            hora: '09:00', // Default
            prioridad: 'media'
        });
        hablar('Tarea creada');
    }
}

// ============================================================================
// TOASTS
// ============================================================================

window.mostrarToast = function (mensaje, tipo = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.textContent = mensaje;
    toast.style.background = tipo === 'error' ? '#fee2e2' : '#d1fae5';
    toast.style.color = tipo === 'error' ? '#991b1b' : '#065f46';
    toast.style.padding = '12px 24px';
    toast.style.marginBottom = '10px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            console.log('👤 Usuario autenticado:', user.email);
            iniciarListenerTareas();
            await cargarSuscripcionFirestore();
            await migrarTareasLocales();
            await inicializarAppAutenticada();
        } else {
            currentUser = null;
            detenerListenerTareas();
            appState.tareas = [];
            renderizarLogin();
        }
    });
});

async function inicializarAppAutenticada() {
    await sincronizarHoraOficial();
    if (currentUser) await cargarSuscripcionFirestore();
    detectarRetornoPago();
    renderizarApp();
}

// Puente para el script inline de asistente.html
window._authStateChanged = (cb) => onAuthStateChanged(auth, cb);
