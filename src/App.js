/**
 * Aplicación Principal - Asistente de Voz Colombiano
 * Gestión de tareas con calendario, voz y alertas
 */

import { inicializarCalendario, recargarCalendario, irAHoy } from './components/Calendar.js';
import { inicializarListaTareas, recargarListaTareas, obtenerTareasActuales } from './components/TaskList.js';
import { inicializarCompletedTaskList, recargarCompletedTaskList } from './components/CompletedTaskList.js';
import { inicializarBotonVoz, limpiarTranscript, setTranscript } from './components/VoiceButton.js';
import { inicializarConfirmacion, mostrarConfirmacion } from './components/TaskForm.js';
import { renderLogin } from './components/Login.js';

import { inicializarDB, guardarTarea, obtenerTareasPorFecha } from './services/TaskStorage.js';
import { inicializarAlertas } from './services/AlertService.js';
import { inicializarGemini, extraerTareaConGemini, generarResumenDia } from './services/GeminiService.js';
import { hablar, identificarComando, extraerInfoTarea } from './services/VoiceService.js';
import { onAuthChange, logout, getCurrentUser } from './services/AuthService.js';

import { crearTarea, validarTarea, PRIORIDADES, CONTEXTOS } from './models/Task.js';

/**
 * Estado global de la aplicación
 */
const appState = {
    initialized: false,
    geminiEnabled: false,
    selectedDate: null,
    procesandoVoz: false,
    currentUser: null
};

/**
 * Inicializa la aplicación
 */
export async function inicializarApp() {
    try {
        mostrarCargando(true);
        await inicializarDB();

        // Escuchar cambios de autenticación
        onAuthChange((user) => {
            appState.currentUser = user;
            if (user) {
                console.log("Usuario autenticado:", user.email);
                iniciarInterfazPrincipal(user);
            } else {
                console.log("No hay usuario autenticado.");
                mostrarLogin();
            }
            mostrarCargando(false);
        });

    } catch (error) {
        console.error('Error inicializando la aplicación:', error);
        mostrarError('Error al inicializar la aplicación. Por favor, recargue la página.');
    }
}

/**
 * Muestra la pantalla de Login
 */
function mostrarLogin() {
    const app = document.getElementById('app');
    // Limpiar app
    app.innerHTML = '';
    renderLogin(app);
}

/**
 * Inicia la interfaz principal de la aplicación
 */
async function iniciarInterfazPrincipal(user) {
    // Renderizar estructura base
    renderizarEstructura(user);

    // Intentar inicializar Gemini (con API key del localStorage si existe)
    const apiKey = localStorage.getItem('gemini_api_key');
    if (apiKey) {
        appState.geminiEnabled = inicializarGemini(apiKey);
    }

    // Inicializar componentes
    await Promise.all([
        inicializarCalendario(document.getElementById('calendar-container'), {
            onDateSelect: manejarSeleccionFecha
        }),
        inicializarListaTareas(document.getElementById('task-list-container'), {
            onUpdate: manejarActualizacionTareas
        }),
        inicializarCompletedTaskList(document.getElementById('completed-tasks-container'), {
            onUpdate: manejarActualizacionTareas
        })
    ]);

    inicializarBotonVoz(document.getElementById('voice-container'), {
        onTranscript: manejarTranscripcion,
        solicitarPermiso: false
    });

    inicializarConfirmacion(document.getElementById('app'));

    // Inicializar alertas
    await inicializarAlertas();

    // Configurar eventos globales
    configurarEventosGlobales();

    appState.initialized = true;
    console.log('Aplicación principal iniciada - Versión 1.3 (Layout Final)');
}

/**
 * Renderiza la estructura base de la aplicación principal
 */
function renderizarEstructura(user) {
    const app = document.getElementById('app');

    app.innerHTML = `
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">🎙️ Asistente de Voz</h1>
        <p class="app-subtitle">Gestión de Tareas Colombia</p>
      </div>
      <div class="header-right" style="display: flex; align-items: center; gap: var(--space-4);">
        <div style="font-size: var(--font-size-xs); color: var(--color-gray-600); text-align: right; display: none; @media(min-width: 600px){display: block;}">
            Hola, ${user.displayName || user.email.split('@')[0]}
        </div>
        <button class="btn btn-secondary" id="btn-today" title="Ir a hoy">
          📅 Hoy
        </button>
        <button class="btn btn-secondary" id="btn-settings" title="Configuración">
          ⚙️
        </button>
        <button class="btn btn-secondary" id="btn-logout" title="Cerrar Sesión" style="color: var(--color-danger);">
          🚪
        </button>
      </div>
    </header>
    
    <main class="main-layout">
      <div class="main-content">
        <div id="calendar-container"></div>
        
        <div class="card" style="margin-top: var(--space-6);">
          <div class="card-header">
            <h3 class="card-title">🎤 Control por Voz</h3>
          </div>
          <div id="voice-container"></div>
          
          <div id="ai-response" class="day-summary hidden" style="margin-top: var(--space-4);">
          </div>
        </div>
      </div>
      
      <aside class="sidebar">
        <div id="task-list-container"></div>
        
        <div id="voice-commands-section">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">💡 Comandos de Voz</h3>
              </div>
              <ul style="font-size: var(--font-size-sm); color: var(--color-gray-600); list-style: none; display: flex; flex-direction: column; gap: var(--space-2);">
                <li>📌 "Nueva tarea pagar arriendo mañana a las 3"</li>
                <li>📋 "¿Qué tareas tengo para hoy?"</li>
                <li>✅ "Marcar cumplida la tarea..."</li>
                <li>📅 "Posponer tarea dos días"</li>
                <li>❓ "Ayuda" - Ver más comandos</li>
              </ul>
            </div>
        </div>
        
        <!-- Contenedor para tareas cumplidas -->
        <div id="completed-tasks-container"></div>
      </aside>
    </main>
    
    <div id="loading-overlay" class="confirmation-dialog">
      <div class="confirmation-content" style="text-align: center;">
        <div class="spinner" style="margin: 0 auto var(--space-4);"></div>
        <p>Cargando...</p>
      </div>
    </div>
    
    <div id="settings-dialog" class="confirmation-dialog" role="dialog" aria-modal="true">
      <div class="confirmation-content">
        <h2 class="confirmation-title">⚙️ Configuración</h2>
        
        <div class="form-group">
          <label class="form-label" for="gemini-api-key">Clave de API de Gemini (opcional)</label>
          <input type="password" class="form-input" id="gemini-api-key" 
                 placeholder="Ingrese su clave de API" 
                 value="${localStorage.getItem('gemini_api_key') || ''}">
          <p style="font-size: var(--font-size-xs); color: var(--color-gray-500); margin-top: var(--space-1);">
            La clave se guarda localmente en su navegador.
          </p>
        </div>
        
        <div class="confirmation-actions">
          <button class="btn btn-secondary" id="btn-cancel-settings">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-settings">Guardar</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Configura los eventos globales
 */
function configurarEventosGlobales() {
    // Botón ir a hoy
    document.getElementById('btn-today').addEventListener('click', async () => {
        await irAHoy(document.getElementById('calendar-container'));
    });

    // Botón de configuración
    document.getElementById('btn-settings').addEventListener('click', () => {
        document.getElementById('settings-dialog').classList.add('active');
    });

    // Cerrar configuración
    document.getElementById('btn-cancel-settings').addEventListener('click', () => {
        document.getElementById('settings-dialog').classList.remove('active');
    });

    // Cerrar sesión
    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (confirm('¿Seguro que desea cerrar sesión?')) {
            mostrarCargando(true);
            await logout();
            // onAuthChange manejará la redirección a login
        }
    });

    // Guardar configuración
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const apiKey = document.getElementById('gemini-api-key').value.trim();

        if (apiKey) {
            localStorage.setItem('gemini_api_key', apiKey);
            appState.geminiEnabled = inicializarGemini(apiKey);
            mostrarNotificacion('Configuración guardada', 'success');
        } else {
            localStorage.removeItem('gemini_api_key');
            appState.geminiEnabled = false;
        }

        document.getElementById('settings-dialog').classList.remove('active');
    });

    // Cerrar diálogos con click fuera
    document.getElementById('settings-dialog').addEventListener('click', (e) => {
        if (e.target.id === 'settings-dialog') {
            document.getElementById('settings-dialog').classList.remove('active');
        }
    });

    // Evento de alerta disparada
    window.addEventListener('alertaDisparada', (e) => {
        const { tarea, alerta } = e.detail;
        mostrarNotificacion(`⏰ Recordatorio: ${tarea.titulo}`, 'warning');
    });

    // Evento de clic en notificación
    window.addEventListener('alertaClick', async (e) => {
        const { tarea } = e.detail;
        // Navegar a la fecha de la tarea
        const fecha = new Date(tarea.fecha);
        await irAHoy(document.getElementById('calendar-container'));
    });
}

/**
 * Maneja cuando se selecciona una fecha en el calendario
 * @param {string} fechaStr - Fecha seleccionada
 * @param {Array} tareas - Tareas del día
 */
async function manejarSeleccionFecha(fechaStr, tareas) {
    appState.selectedDate = fechaStr;

    // Generar resumen del día con IA
    const responseContainer = document.getElementById('ai-response');

    if (tareas.length > 0) {
        responseContainer.classList.remove('hidden');
        const resumen = await generarResumenDia(tareas);
        responseContainer.innerHTML = `
      <p class="day-summary-title">📊 Resumen del día</p>
      <p class="day-summary-text">${resumen}</p>
    `;
    } else {
        responseContainer.classList.add('hidden');
    }
}

/**
 * Maneja la transcripción de voz
 * @param {string} texto - Texto transcrito
 */
async function manejarTranscripcion(texto) {
    if (appState.procesandoVoz) return;

    appState.procesandoVoz = true;

    try {
        console.log('Transcripción recibida:', texto);

        // Verificar si es un comando
        const comando = identificarComando(texto);

        if (comando) {
            await procesarComando(comando, texto);
        } else {
            // Asumir que es una nueva tarea
            await procesarNuevaTarea(texto);
        }
    } catch (error) {
        console.error('Error procesando transcripción:', error);
        await hablar('Lo siento, hubo un error procesando su solicitud. Por favor, intente de nuevo.');
    } finally {
        appState.procesandoVoz = false;
    }
}

/**
 * Procesa un comando de voz identificado
 * @param {Object} comando - Comando identificado
 * @param {string} textoOriginal - Texto original
 */
async function procesarComando(comando, textoOriginal) {
    switch (comando.comando) {
        case 'CREAR_TAREA':
            await procesarNuevaTarea(textoOriginal);
            break;

        case 'VER_TAREAS':
            const tareas = obtenerTareasActuales();
            const pendientes = tareas.filter(t => t.estado === 'Pendiente');
            await hablar(`Tienes ${pendientes.length} tareas pendientes.`);
            break;

        case 'CONSULTAR_TAREAS':
            await consultarTareas(textoOriginal);
            break;

        case 'AYUDA':
            await mostrarAyuda();
            break;

        default:
            await hablar('Entendí el comando, pero aún no está implementado. Por favor, intente con otro.');
    }
}

/**
 * Procesa la creación de una nueva tarea
 * @param {string} texto - Descripción de la tarea
 */
async function procesarNuevaTarea(texto) {
    setTranscript('Procesando...');

    // Extraer información de la tarea
    let infoTarea;

    if (appState.geminiEnabled) {
        infoTarea = await extraerTareaConGemini(texto);
    } else {
        infoTarea = extraerInfoTarea(texto);
    }

    console.log('Información extraída:', infoTarea);

    // Verificar si hay ambigüedad
    if (infoTarea.ambiguo && infoTarea.preguntaClarificacion) {
        await hablar(infoTarea.preguntaClarificacion);
        setTranscript(infoTarea.preguntaClarificacion);
        return;
    }

    // Completar con valores por defecto
    const hoy = new Date();
    const fechaDefault = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;

    const datosTarea = {
        titulo: infoTarea.titulo || 'Nueva tarea',
        fecha: infoTarea.fecha || fechaDefault,
        hora: infoTarea.hora || '09:00',
        contexto: infoTarea.contexto || CONTEXTOS.PERSONAL,
        prioridad: infoTarea.prioridad || PRIORIDADES.MEDIA
    };

    // Crear objeto de tarea
    const nuevaTarea = crearTarea(datosTarea);

    // Validar
    const validacion = validarTarea(nuevaTarea);
    if (!validacion.isValid) {
        await hablar(`Hay un problema con la tarea: ${validacion.errores[0]}`);
        return;
    }

    // Mostrar confirmación (OBLIGATORIO)
    mostrarConfirmacion(nuevaTarea, {
        onConfirm: async (tarea) => {
            try {
                await guardarTarea(tarea);
                await recargarCalendario(document.getElementById('calendar-container'));
                await recargarListaTareas();
                await recargarCompletedTaskList();

                await hablar('Tarea guardada correctamente.');
                mostrarNotificacion('Tarea creada con éxito', 'success');
                limpiarTranscript();
            } catch (error) {
                console.error('Error guardando tarea:', error);
                await hablar('Hubo un error al guardar la tarea.');
                mostrarNotificacion('Error al guardar la tarea', 'error');
            }
        },
        onModify: async (tarea) => {
            await hablar('Por favor, diga nuevamente la tarea con las modificaciones.');
            limpiarTranscript();
        },
        onCancel: () => {
            limpiarTranscript();
        }
    });

    // Leer confirmación
    await hablar(`He entendido: ${nuevaTarea.titulo}. ¿Desea confirmarla?`);
}

/**
 * Consulta tareas según el texto
 * @param {string} texto - Texto de consulta
 */
async function consultarTareas(texto) {
    const textoLower = texto.toLowerCase();
    const tareas = obtenerTareasActuales();
    const hoy = new Date();

    let tareasAMostrar = [];
    let periodo = '';

    if (textoLower.includes('hoy')) {
        const hoyStr = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        tareasAMostrar = tareas.filter(t => t.fecha === hoyStr && t.estado === 'Pendiente');
        periodo = 'hoy';
    } else if (textoLower.includes('mañana')) {
        const manana = new Date(hoy);
        manana.setDate(manana.getDate() + 1);
        const mananaStr = `${manana.getFullYear()}-${(manana.getMonth() + 1).toString().padStart(2, '0')}-${manana.getDate().toString().padStart(2, '0')}`;
        tareasAMostrar = tareas.filter(t => t.fecha === mananaStr && t.estado === 'Pendiente');
        periodo = 'mañana';
    } else if (textoLower.includes('semana')) {
        const finSemana = new Date(hoy);
        finSemana.setDate(finSemana.getDate() + 7);
        const hoyStr = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;
        const finStr = `${finSemana.getFullYear()}-${(finSemana.getMonth() + 1).toString().padStart(2, '0')}-${finSemana.getDate().toString().padStart(2, '0')}`;
        tareasAMostrar = tareas.filter(t => t.fecha >= hoyStr && t.fecha <= finStr && t.estado === 'Pendiente');
        periodo = 'esta semana';
    }

    if (tareasAMostrar.length === 0) {
        await hablar(`No tienes tareas pendientes para ${periodo}.`);
    } else {
        const mensaje = tareasAMostrar.length === 1
            ? `Tienes una tarea para ${periodo}: ${tareasAMostrar[0].titulo}.`
            : `Tienes ${tareasAMostrar.length} tareas para ${periodo}. La primera es: ${tareasAMostrar[0].titulo}.`;
        await hablar(mensaje);
    }
}

/**
 * Muestra ayuda de comandos
 */
async function mostrarAyuda() {
    const ayuda = `
    Puedo ayudarte con lo siguiente:
    Diga "Nueva tarea" seguido de la descripción.
    Diga "¿Qué tareas tengo para hoy?" para consultar.
    Diga "Marcar cumplida" para completar una tarea.
    También puede navegar el calendario y ver sus tareas en la lista.
  `;

    await hablar(ayuda);
}

/**
 * Maneja la actualización de tareas
 */
async function manejarActualizacionTareas() {
    await recargarCalendario(document.getElementById('calendar-container'));
    await recargarListaTareas();
    await recargarCompletedTaskList();
}

/**
 * Muestra/oculta el indicador de carga
 * @param {boolean} mostrar - true para mostrar
 */
function mostrarCargando(mostrar) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (mostrar) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

/**
 * Muestra un error en la UI
 * @param {string} mensaje - Mensaje de error
 */
function mostrarError(mensaje) {
    const app = document.getElementById('app');
    app.innerHTML = `
    <div class="empty-state" style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <div class="empty-state-icon">❌</div>
      <h3 class="empty-state-title">Error</h3>
      <p class="empty-state-text">${mensaje}</p>
      <button class="btn btn-primary" onclick="location.reload()" style="margin-top: var(--space-4);">
        Recargar Página
      </button>
    </div>
  `;
}

/**
 * Muestra una notificación toast
 * @param {string} mensaje - Mensaje
 * @param {string} tipo - Tipo de notificación
 */
function mostrarNotificacion(mensaje, tipo = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const iconos = {
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'info': 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `
    <span class="toast-icon">${iconos[tipo]}</span>
    <div class="toast-content">
      <p class="toast-message">${mensaje}</p>
    </div>
    <button class="toast-close" aria-label="Cerrar">×</button>
  `;

    toastContainer.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), 4000);
}
