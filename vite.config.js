import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: './',
    server: {
        port: 5173,
        host: true
    },
    publicDir: 'public',
    build: {
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                asistente: resolve(__dirname, 'asistente.html')
            }
        },
        copyPublicDir: true
    }
});
