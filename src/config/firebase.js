// Configuración de Firebase
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyAIysupp_PUY-EqiBx52CSW5sJP632xA-A",
    authDomain: "obligo360-2d5e2.firebaseapp.com",
    projectId: "obligo360-2d5e2",
    storageBucket: "obligo360-2d5e2.firebasestorage.app",
    messagingSenderId: "767497513929",
    appId: "1:767497513929:web:6d0724967758cd932f9618",
    measurementId: "G-48TS2KLQC7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
const auth = getAuth(app);
const storage = getStorage(app);

// Firebase SDK v10: la persistencia offline se configura DENTRO de initializeFirestore
// mediante persistentLocalCache (reemplaza a la antigua enableIndexedDbPersistence)
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
    console.log('[Firebase] ✅ Firestore con persistencia offline habilitada (multi-tab)');
} catch (e) {
    // Fallback: sin persistencia si el navegador no soporta IndexedDB o ya fue inicializado
    console.warn('[Firebase] ⚠️ Iniciando Firestore sin persistencia offline:', e.message);
    db = initializeFirestore(app, {});
}

export { auth, db, storage, firebaseConfig };

export default app;
