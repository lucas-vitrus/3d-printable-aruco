import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    base: '/3d-printable-aruco/',
    plugins: [react()],
    server: { host: '127.0.0.1', port: 4178 },
    preview: { host: '127.0.0.1', port: 4178 },
});
