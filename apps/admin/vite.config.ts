import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const envDir = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');

  return {
    plugins: [react()],
    envDir,
    server: {
      port: 5174,
      // Нужен для отладки через туннель (ngrok/cloudflared/localhost.run):
      // Telegram открывает Mini App только по https с внешнего домена.
      host: true,
      // Vite отклоняет запросы с незнакомым заголовком Host — защита от
      // DNS rebinding. Туннель приходит под своим доменом, поэтому его
      // нужно разрешить явно: список берём из TUNNEL_HOSTS в .env,
      // плюс домены популярных сервисов туннелирования.
      allowedHosts: [
        ...(env.TUNNEL_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
        '.trycloudflare.com',
        '.lhr.life',
        '.ngrok-free.app',
        '.ngrok.io',
        '.loca.lt',
      ],
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
        // Локальное хранилище файлов отдаёт сам API.
        '/uploads': {
          target: env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: { outDir: 'dist', sourcemap: true },
  };
});
