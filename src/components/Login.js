/**
 * Componente de Login
 * Muestra formulario de inicio de sesión con detección de dispositivo
 */
import { loginWithGoogle, loginWithEmail } from '../services/AuthService.js';
import { detectDevice, detectBrowser, autoConfigureVoiceMode, getDeviceInfo } from '../services/DeviceService.js';

export function renderLogin(containerElement, callbacks = {}) {
    if (!containerElement) return;

    // Auto-detectar dispositivo al cargar
    autoConfigureVoiceMode();
    const deviceInfo = getDeviceInfo();
    const detectedDevice = deviceInfo.device;

    containerElement.innerHTML = `
        <div class="login-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; max-width: 400px; margin: 0 auto;">
            <div class="card" style="width: 100%; padding: var(--space-8);">
                <div style="text-align: center; margin-bottom: var(--space-6);">
                   <img src="/logo-obligo360.png" alt="Obligo360" style="height: 70px; margin-bottom: var(--space-4); background: rgba(30, 41, 59, 0.95); padding: 10px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                   <h2 class="card-title" style="font-size: var(--font-size-xl);">Bienvenido a Obligo360</h2>
                   <p style="color: var(--color-gray-500); font-size: var(--font-size-sm);">Tu asistente para cumplir sin estrés</p>
                </div>



                    <form id="email-login-form">
                        <div class="form-group">
                            <label class="form-label" for="email">Correo electrónico</label>
                            <input type="email" id="email" class="form-input" required placeholder="nombre@ejemplo.com">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="password">Contraseña</label>
                            <input type="password" id="password" class="form-input" required placeholder="••••••••">
                        </div>
                        
                        <div id="login-error" style="color: var(--color-danger); font-size: var(--font-size-sm); margin-bottom: var(--space-3); display: none;"></div>

                        <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">
                            Iniciar Sesión
                        </button>
                    </form>
                    
                    <p style="text-align: center; margin-top: var(--space-4); font-size: var(--font-size-xs); color: var(--color-gray-500);">
                        🔒 Contacte al administrador para obtener acceso al sistema.
                    </p>

                    <div style="margin-top: var(--space-6); border-top: 1px solid var(--color-gray-200); padding-top: var(--space-4);">
                        <p style="text-align: center; color: var(--color-gray-500); font-size: var(--font-size-xs); margin-bottom: var(--space-2);">
                            Optimización de voz por dispositivo
                        </p>
                        <div id="device-detected" style="text-align: center; font-size: var(--font-size-xs); color: var(--color-success); margin-bottom: var(--space-3);">
                            ${getDeviceDetectedMessage(detectedDevice)}
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
                            <button id="btn-mode-android" class="btn ${detectedDevice === 'android' ? 'btn-primary' : 'btn-secondary'}" style="justify-content: center; font-size: var(--font-size-xs);">
                                📱 App Android
                            </button>
                            <button id="btn-mode-ios" class="btn ${detectedDevice === 'ios' ? 'btn-primary' : 'btn-secondary'}" style="justify-content: center; font-size: var(--font-size-xs);">
                                🍎 App iPhone
                            </button>
                        </div>
                        <div id="device-msg" style="text-align: center; font-size: var(--font-size-xs); margin-top: var(--space-2); min-height: 20px;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listeners

    const form = containerElement.querySelector('#email-login-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const loginError = containerElement.querySelector('#login-error');

    // Botones de modo
    const btnAndroid = containerElement.querySelector('#btn-mode-android');
    const btnIos = containerElement.querySelector('#btn-mode-ios');
    const deviceMsg = containerElement.querySelector('#device-msg');



    // Lógica de selección de modo (sin recarga)
    const setDeviceMode = (selectedDevice, buttonClicked) => {
        const actualDevice = detectDevice();

        // Reset botones
        btnAndroid.classList.remove('btn-primary');
        btnIos.classList.remove('btn-primary');
        btnAndroid.classList.add('btn-secondary');
        btnIos.classList.add('btn-secondary');

        let message = '';
        let color = 'var(--color-success)';

        // Verificación de dispositivo
        if (selectedDevice === 'android' && actualDevice !== 'android' && actualDevice !== 'desktop') {
            message = '⚠️ Estás en un dispositivo iOS. Modo Android activado de todos modos.';
            color = 'var(--color-warning)';
        } else if (selectedDevice === 'ios' && actualDevice !== 'ios' && actualDevice !== 'desktop') {
            message = '⚠️ Estás en un dispositivo Android. Modo iPhone activado de todos modos.';
            color = 'var(--color-warning)';
        } else {
            message = `✅ Modo ${selectedDevice === 'android' ? 'Android' : 'iPhone'} activado.`;
        }

        // Guardar preferencia (streaming mode se usa siempre, esto es para tracking)
        localStorage.setItem('selected_device', selectedDevice);
        localStorage.setItem('voice_mode', 'streaming');

        // Feedback visual
        deviceMsg.textContent = message;
        deviceMsg.style.color = color;
        buttonClicked.classList.remove('btn-secondary');
        buttonClicked.classList.add('btn-primary');
    };

    btnAndroid.addEventListener('click', () => setDeviceMode('android', btnAndroid));
    btnIos.addEventListener('click', () => setDeviceMode('ios', btnIos));





    // Submit formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = form.querySelector('#email').value;
        const password = form.querySelector('#password').value;

        if (password.length < 6) {
            loginError.textContent = "La contraseña debe tener al menos 6 caracteres.";
            loginError.style.display = 'block';
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Procesando...';
            await loginWithEmail(email, password);
        } catch (error) {
            console.error(error);
            let msg = "Error de autenticación: " + error.code;
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = "Credenciales incorrectas. Contacte al administrador si no tiene cuenta.";
            }
            loginError.textContent = msg;
            loginError.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Iniciar Sesión';
        }
    });
}

/**
 * Genera mensaje de dispositivo detectado
 * @param {string} device - Tipo de dispositivo
 * @returns {string} Mensaje HTML
 */
function getDeviceDetectedMessage(device) {
    switch (device) {
        case 'android':
            return '📱 Detectado: Android - Modo optimizado activado automáticamente';
        case 'ios':
            return '🍎 Detectado: iPhone/iPad - Modo optimizado activado automáticamente';
        default:
            return '💻 Detectado: Escritorio - Seleccione un modo si usa móvil';
    }
}
