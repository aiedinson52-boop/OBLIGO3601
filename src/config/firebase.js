// Configuración de Firebase
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
