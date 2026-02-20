/**
 * Servicio de Gestión de Usuarios y Roles (RBAC)
 */
import { db, auth } from '../config/firebase.js';
import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    serverTimestamp,
    updateDoc
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
// Importamos la config para inicializar la app secundaria
import { firebaseConfig } from '../config/firebase.js';

const USERS_COLLECTION = 'users';

/**
 * Roles del sistema
 */
export const ROLES = {
    ADMIN: 'admin',
    OPERATOR: 'operator'
};

/**
 * Verifica si es el primer usuario y lo promueve a Admin
 * @param {User} user - Usuario autenticado de Firebase
 */
export async function checkAndPromoteFirstUser(user) {
    if (!user) return;

    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        // Usuario ya existe, actualizar lastLogin y retornar su rol
        await updateDoc(userRef, { lastLogin: serverTimestamp() });
        return userSnap.data().role;
    }

    // Verificar si existen otros usuarios con rol admin
    const q = query(collection(db, USERS_COLLECTION), where('role', '==', ROLES.ADMIN));
    const querySnapshot = await getDocs(q);

    let role = ROLES.OPERATOR; // Por defecto

    // Si no hay admins, este usuario será el primero
    if (querySnapshot.empty) {
        console.log('🎉 Primer usuario detectado. Promoviendo a Administrador.');
        role = ROLES.ADMIN;
    }

    // Crear perfil en Firestore
    await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        role: role,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
    });

    return role;
}

/**
 * Obtiene el perfil completo del usuario
 * @param {string} uid 
 */
export async function getUserProfile(uid) {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? { id: uid, ...userSnap.data() } : null;
}

/**
 * Obtiene todos los usuarios (Solo para Admin)
 */
export async function getAllUsers() {
    const querySnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const users = [];
    querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
    });
    return users;
}

/**
 * Obtiene todos los operadores del equipo (para visibilidad cruzada)
 * Tanto Admin como Operadores pueden ver los miembros del equipo
 */
export async function getTeamMembers() {
    const querySnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const members = [];
    querySnapshot.forEach((docSnap) => {
        members.push({ id: docSnap.id, ...docSnap.data() });
    });
    return members;
}

/**
 * Obtiene el conteo de tareas de un usuario específico
 * @param {string} userId - UID del usuario
 * @returns {Promise<{pending: number, completed: number}>}
 */
export async function getTaskCountsForUser(userId) {
    try {
        const tasksRef = collection(db, 'users', userId, 'tasks');
        const querySnapshot = await getDocs(tasksRef);
        let pending = 0;
        let completed = 0;
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.estado === 'Pendiente') pending++;
            else if (data.estado === 'Cumplida') completed++;
        });
        return { pending, completed };
    } catch (error) {
        console.error(`Error getting task counts for user ${userId}:`, error);
        return { pending: 0, completed: 0 };
    }
}

/**
 * Verifica si el usuario actual es Administrador
 */
export async function isCurrentUserAdmin() {
    const user = auth.currentUser;
    if (!user) return false;
    const profile = await getUserProfile(user.uid);
    return profile && profile.role === ROLES.ADMIN;
}

/**
 * Crea un nuevo Operador usando una instancia secundaria de Firebase
 * para no cerrar la sesión del Administrador actual.
 * Solo un Admin puede crear operadores.
 * @param {string} email 
 * @param {string} password 
 * @param {string} name 
 */
export async function createOperator(email, password, name) {
    // Verificar que el usuario actual es admin
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No hay usuario autenticado');

    const adminProfile = await getUserProfile(currentUser.uid);
    if (!adminProfile || adminProfile.role !== ROLES.ADMIN) {
        throw new Error('Solo los administradores pueden crear operadores');
    }

    // Inicializar app secundaria
    let secondaryApp;
    try {
        secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
    } catch (e) {
        // Si ya existe, generar nombre único
        secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Math.random().toString(36));
    }
    const secondaryAuth = getAuth(secondaryApp);

    try {
        // 1. Crear usuario en Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUser = userCredential.user;

        // 2. Crear perfil en Firestore (Usando la instancia principal db)
        await setDoc(doc(db, USERS_COLLECTION, newUser.uid), {
            email: email,
            displayName: name,
            role: ROLES.OPERATOR,
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid // Auditoría - vincula al admin que lo creó
        });

        // 3. Cerrar sesión en app secundaria para limpiar
        await signOut(secondaryAuth);

        console.log(`✅ Operador creado: ${email} (${newUser.uid})`);
        return newUser;

    } catch (error) {
        console.error("Error creando operador:", error);
        throw error;
    } finally {
        // Limpiar app secundaria
        try {
            await deleteApp(secondaryApp);
        } catch (e) {
            // Ignorar errores de limpieza
        }
    }
}
