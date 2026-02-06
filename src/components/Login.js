/**
 * Componente de Login
 * Muestra formulario de inicio de sesión con detección de dispositivo
 */
import { loginWithGoogle, loginWithEmail, registerWithEmail } from '../services/AuthService.js';
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
                   <h1 style="font-size: var(--font-size-3xl); margin-bottom: var(--space-2);">🎙️</h1>
                   <h2 class="card-title" style="font-size: var(--font-size-xl);">Bienvenido a Obligo360</h2>
                   <p style="color: var(--color-gray-500); font-size: var(--font-size-sm);">Tu asistente para cumplir sin estrés</p>
                </div>

                <div class="form-group">
                    <button id="btn-google-login" class="btn btn-secondary" style="width: 100%; justify-content: center; margin-bottom: var(--space-4);">
                        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="margin-right: var(--space-2);">
                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill-rule="evenodd" fill-opacity="1" fill="#4285f4" stroke="none"></path>
                            <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9.003 18z" fill-rule="evenodd" fill-opacity="1" fill="#34a853" stroke="none"></path>
                            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.448 2.397 1.257 3.687l3.007-2.317v-.001z" fill-rule="evenodd" fill-opacity="1" fill="#fbbc05" stroke="none"></path>
                            <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9.003 0 5.467 0 2.41 2.073.957 4.958L3.964 7.29C4.672 5.159 6.656 3.58 9.003 3.58z" fill-rule="evenodd" fill-opacity="1" fill="#ea4335" stroke="none"></path>
                        </svg>
                        Continuar con Google
                    </button>
                    
                    <div style="display: flex; align-items: center; margin: var(--space-4) 0;">
                        <span style="flex-grow: 1; border-top: 1px solid var(--color-gray-300);"></span>
                        <span style="padding: 0 var(--space-2); color: var(--color-gray-400); font-size: var(--font-size-xs);">O correo electrónico</span>
                        <span style="flex-grow: 1; border-top: 1px solid var(--color-gray-300);"></span>
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
                    
                    <p style="text-align: center; margin-top: var(--space-4); font-size: var(--font-size-sm);">
                        ¿No tienes cuenta? <a href="#" id="toggle-register" style="color: var(--color-primary-600); text-decoration: none; font-weight: 500;">Regístrate aquí</a>
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
    const googleBtn = containerElement.querySelector('#btn-google-login');
    const form = containerElement.querySelector('#email-login-form');
    const toggleLink = containerElement.querySelector('#toggle-register');
    const submitBtn = form.querySelector('button[type="submit"]');
    const loginError = containerElement.querySelector('#login-error');

    // Botones de modo
    const btnAndroid = containerElement.querySelector('#btn-mode-android');
    const btnIos = containerElement.querySelector('#btn-mode-ios');
    const deviceMsg = containerElement.querySelector('#device-msg');

    let isRegistering = false;

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

    // Login con Google
    googleBtn.addEventListener('click', async () => {
        try {
            googleBtn.disabled = true;
            googleBtn.innerHTML = 'Conectando...';
            await loginWithGoogle();
        } catch (error) {
            console.error(error);
            loginError.textContent = "Error al conectar con Google.";
            loginError.style.display = 'block';
            googleBtn.disabled = false;
            googleBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="margin-right: var(--space-2);">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill-rule="evenodd" fill-opacity="1" fill="#4285f4" stroke="none"></path>
                    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9.003 18z" fill-rule="evenodd" fill-opacity="1" fill="#34a853" stroke="none"></path>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.448 2.397 1.257 3.687l3.007-2.317v-.001z" fill-rule="evenodd" fill-opacity="1" fill="#fbbc05" stroke="none"></path>
                    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9.003 0 5.467 0 2.41 2.073.957 4.958L3.964 7.29C4.672 5.159 6.656 3.58 9.003 3.58z" fill-rule="evenodd" fill-opacity="1" fill="#ea4335" stroke="none"></path>
                </svg>
                Continuar con Google
            `;
        }
    });

    // Toggle Registro/Login
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isRegistering = !isRegistering;
        if (isRegistering) {
            submitBtn.textContent = 'Registrarse';
            toggleLink.innerHTML = '¿Ya tienes cuenta? <span style="text-decoration: underline;">Inicia sesión</span>';
        } else {
            submitBtn.textContent = 'Iniciar Sesión';
            toggleLink.innerHTML = '¿No tienes cuenta? <span style="text-decoration: underline;">Regístrate aquí</span>';
        }
        loginError.style.display = 'none';
        form.reset();
    });

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

            if (isRegistering) {
                await registerWithEmail(email, password);
            } else {
                await loginWithEmail(email, password);
            }
        } catch (error) {
            console.error(error);
            let msg = "Error de autenticación: " + error.code;
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = "Credenciales incorrectas.";
            } else if (error.code === 'auth/email-already-in-use') {
                msg = "Este correo ya está registrado.";
            } else if (error.code === 'auth/weak-password') {
                msg = "La contraseña es muy débil.";
            }
            loginError.textContent = msg;
            loginError.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = isRegistering ? 'Registrarse' : 'Iniciar Sesión';
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
