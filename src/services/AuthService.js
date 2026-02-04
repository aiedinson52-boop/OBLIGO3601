/**
 * Servicio de Autenticación con Firebase
 */
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '../config/firebase.js';

const googleProvider = new GoogleAuthProvider();

/**
 * Iniciar sesión con Google
 * @returns {Promise<User>} Usuario autenticado
 */
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Error en login con Google:", error);
        throw error;
    }
}

/**
 * Iniciar sesión con Email y Contraseña
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<User>} Usuario autenticado
 */
export async function loginWithEmail(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
    } catch (error) {
        throw error;
    }
}

/**
 * Registrarse con Email y Contraseña
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<User>} Usuario registrado
 */
export async function registerWithEmail(email, password) {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return result.user;
    } catch (error) {
        throw error;
    }
}

/**
 * Cerrar sesión
 */
export async function logout() {
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
}

/**
 * Suscribirse a cambios en el estado de autenticación
 * @param {Function} callback 
 * @returns {Function} Función para cancelar suscripción
 */
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

/**
 * Obtener usuario actual
 * @returns {User|null}
 */
export function getCurrentUser() {
    return auth.currentUser;
}
