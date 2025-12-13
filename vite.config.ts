import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Ensures assets are loaded correctly in subdirectories (like GitHub Pages)
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
