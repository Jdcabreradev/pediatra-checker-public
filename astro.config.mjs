import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

import node from '@astrojs/node';
import { webcore } from 'webcoreui/integration';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        external: ['@lancedb/lancedb']
      }
    }
  },

  integrations: [react(), webcore()],

  adapter: node({
    mode: 'standalone'
  })
});