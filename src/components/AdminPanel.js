import { createOperator, getAllUsers, getTeamMembers, getTaskCountsForUser, ROLES } from '../services/UserService.js';
import { obtenerTareasPendientes } from '../services/TaskStorage.js';
import { calcularTiempoRestante } from '../services/AlertService.js';

let modalContainer = null;

export function renderAdminPanel(containerId, onOptions = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <button id="btn-admin-panel" class="btn btn-primary" style="width: 100%; margin-bottom: var(--space-4);">
            🛠️ Panel de Administración
        </button>
        <div id="operator-selector-container" style="display: none;">
            <label class="form-label">Ver tareas de:</label>
            <select id="operator-selector" class="form-input form-select">
                <option value="">👤 Mis Tareas</option>
            </select>
        </div>
    `;

    document.getElementById('btn-admin-panel').addEventListener('click', () => {
        showAdminAuthModal(onOptions);
    });
}

export function renderOperatorPanel(containerId, onOptions = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <button id="btn-team-view" class="btn btn-secondary" style="width: 100%; margin-bottom: var(--space-4);">
            👥 Ver Equipo
        </button>
    `;

    document.getElementById('btn-team-view').addEventListener('click', () => {
        // Mostrar dashboard directamente, sin password, y sin opción de crear
        showAdminDashboard({ ...onOptions, readOnly: true });
    });
}

function showAdminAuthModal(onOptions) {
    if (document.getElementById('admin-auth-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'admin-auth-modal';
    modal.className = 'confirmation-dialog active';
    modal.innerHTML = `
        <div class="confirmation-content">
            <h2 class="confirmation-title">🔐 Acceso de Administrador</h2>
            <p style="margin-bottom: var(--space-4); color: var(--color-gray-600);">
                Ingrese la contraseña de control total para acceder.
            </p>
            <div class="form-group">
                <input type="password" id="admin-password" class="form-input" placeholder="Contraseña">
            </div>
            <div id="admin-error-msg" style="color: var(--color-danger); font-size: var(--font-size-sm); display: none; margin-bottom: var(--space-4);">
                Contraseña incorrecta
            </div>
            <div class="confirmation-actions">
                <button id="btn-cancel-auth" class="btn btn-secondary">Cancelar</button>
                <button id="btn-confirm-auth" class="btn btn-primary">Acceder</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const checkPassword = () => {
        const pwd = document.getElementById('admin-password').value;
        if (pwd === 'controltotal') {
            modal.remove();
            showAdminDashboard(onOptions);
        } else {
            const err = document.getElementById('admin-error-msg');
            err.style.display = 'block';
            document.getElementById('admin-password').value = '';
        }
    };

    document.getElementById('btn-confirm-auth').addEventListener('click', checkPassword);
    document.getElementById('admin-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkPassword();
    });
    document.getElementById('btn-cancel-auth').addEventListener('click', () => modal.remove());
}

async function showAdminDashboard(onOptions) {
    const isReadOnly = onOptions.readOnly || false;
    const modal = document.createElement('div');
    modal.className = 'confirmation-dialog active';

    // Si es readOnly (Operador), ocultar panel de creación
    const gridStyle = isReadOnly ? "display: block;" : "display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6);";
    const createSection = isReadOnly ? '' : `
                <!-- Crear Operador -->
                <div style="background: var(--color-gray-50); padding: var(--space-4); border-radius: var(--radius-lg);">
                    <h3 style="font-size: var(--font-size-lg); font-weight: 600; margin-bottom: var(--space-4);">➕ Nuevo Operador</h3>
                    <div class="form-group">
                        <label class="form-label">Nombre</label>
                        <input type="text" id="new-op-name" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Correo</label>
                        <input type="email" id="new-op-email" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Contraseña</label>
                        <input type="password" id="new-op-pwd" class="form-input">
                    </div>
                    <button id="btn-create-op" class="btn btn-success" style="width: 100;">Crear Operador</button>
                    <div id="create-op-msg" style="margin-top: var(--space-2); font-size: var(--font-size-sm);"></div>
                </div>
    `;

    modal.innerHTML = `
        <div class="confirmation-content" style="max-width: 900px; width: 95%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6);">
                <h2 class="confirmation-title" style="margin: 0;">${isReadOnly ? '👥 Equipo' : '🛠️ Gestión de Operadores'}</h2>
                <button id="btn-close-dashboard" class="btn btn-secondary">✖</button>
            </div>

            <div style="${gridStyle}">
                <!-- Lista de Operadores -->
                <div>
                    <h3 style="font-size: var(--font-size-lg); font-weight: 600; margin-bottom: var(--space-4);">Miembros del Equipo</h3>
                    <div id="operators-list" style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3);">
                        <div style="text-align: center; color: var(--color-gray-500);">Cargando equipo...</div>
                    </div>
                    ${isReadOnly ? '<button id="btn-back-self" class="btn btn-primary" style="margin-top: var(--space-4); width: 100%;">🔙 Volver a mis tareas</button>' : ''}
                </div>

                ${createSection}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-close-dashboard').addEventListener('click', () => modal.remove());

    if (isReadOnly) {
        document.getElementById('btn-back-self').addEventListener('click', () => {
            if (onOptions.onSelectOperator) {
                onOptions.onSelectOperator(null); // Null = Yo mismo
            }
            modal.remove();
        });
    }

    // Cargar usuarios con conteo de tareas
    const loadUsers = async () => {
        const listContainer = document.getElementById('operators-list');
        try {
            const users = isReadOnly ? await getTeamMembers() : await getAllUsers();
            listContainer.innerHTML = '';

            if (users.length === 0) {
                listContainer.innerHTML = '<div style="color: var(--color-gray-500); padding: var(--space-2);">No hay usuarios registrados</div>';
                return;
            }

            // Cargar conteos de tareas para todos los usuarios en paralelo
            const usersWithCounts = await Promise.all(
                users.map(async (op) => {
                    const counts = await getTaskCountsForUser(op.id);
                    return { ...op, taskCounts: counts };
                })
            );

            usersWithCounts.forEach(op => {
                const item = document.createElement('div');
                item.className = 'task-card';
                item.style.marginBottom = 'var(--space-2)';
                item.style.padding = 'var(--space-3)';
                item.style.borderLeftColor = op.role === 'admin' ? 'var(--color-warning)' : 'var(--color-primary-500)';

                // Indicador de tareas vencidas
                const hasOverdue = op.taskCounts.pending > 0;
                const roleLabel = op.role === 'admin' ? '👑 Admin' : '👤 Operador';
                const roleBadgeColor = op.role === 'admin' ? 'var(--color-warning)' : 'var(--color-primary-500)';

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: 600; font-size: var(--font-size-base);">${op.displayName || op.email}</div>
                            <div style="font-size: var(--font-size-xs); color: var(--color-gray-500);">${op.email}</div>
                            <div style="margin-top: var(--space-1);">
                                <span style="font-size: var(--font-size-xs); background: ${roleBadgeColor}; color: white; padding: 2px 8px; border-radius: 12px;">${roleLabel}</span>
                            </div>
                        </div>
                        <div style="text-align: right; font-size: var(--font-size-xs);">
                            <div style="color: var(--color-warning); font-weight: 600;">📋 ${op.taskCounts.pending} pendientes</div>
                            <div style="color: var(--color-success);">✅ ${op.taskCounts.completed} cumplidas</div>
                        </div>
                    </div>
                    <button class="btn btn-secondary btn-sm" style="margin-top: var(--space-2); width: 100%; font-size: 0.8rem;">
                        👁️ Ver Tareas
                    </button>
                `;

                // Botón "Ver Tareas"
                item.querySelector('button').addEventListener('click', () => {
                    if (onOptions.onSelectOperator) {
                        onOptions.onSelectOperator(op);
                    }
                    modal.remove();
                });

                listContainer.appendChild(item);
            });

        } catch (error) {
            console.error(error);
            listContainer.innerHTML = '<div style="color: var(--color-danger);">Error cargando usuarios</div>';
        }
    };

    loadUsers();

    // Crear operador logic (Solo si no es readOnly)
    if (!isReadOnly) {
        document.getElementById('btn-create-op').addEventListener('click', async () => {
            const name = document.getElementById('new-op-name').value;
            const email = document.getElementById('new-op-email').value;
            const pwd = document.getElementById('new-op-pwd').value;
            const msg = document.getElementById('create-op-msg');

            if (!name || !email || !pwd) {
                msg.textContent = '❌ Todos los campos son obligatorios';
                msg.style.color = 'var(--color-danger)';
                return;
            }

            if (pwd.length < 6) {
                msg.textContent = '❌ La contraseña debe tener al menos 6 caracteres';
                msg.style.color = 'var(--color-danger)';
                return;
            }

            msg.textContent = '⏳ Creando...';
            msg.style.color = 'var(--color-info)';

            try {
                await createOperator(email, pwd, name);
                msg.textContent = '✅ Operador creado exitosamente';
                msg.style.color = 'var(--color-success)';

                // Limpiar
                document.getElementById('new-op-name').value = '';
                document.getElementById('new-op-email').value = '';
                document.getElementById('new-op-pwd').value = '';

                // Recargar lista
                loadUsers();
            } catch (error) {
                console.error(error);
                let errorText = 'Error al crear';
                if (error.code === 'auth/email-already-in-use') errorText = 'El correo ya está en uso';
                if (error.code === 'auth/weak-password') errorText = 'La contraseña es muy débil (mín. 6 caracteres)';
                if (error.message && error.message.includes('administradores')) errorText = error.message;

                msg.textContent = '❌ ' + errorText;
                msg.style.color = 'var(--color-danger)';
            }
        });
    }
}
