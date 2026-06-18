/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['tesseract.js', 'sharp'],
    },
    webpack: (config, { dev, isServer }) => {
        if (dev) {
            // Disable filesystem cache — prevents stale chunk 404s
            config.cache = false;

            // Ignore runtime-written files from the watcher to prevent
            // spurious recompiles that cause chunk 404 crashes
            config.watchOptions = {
                ...config.watchOptions,
                ignored: [
                    '**/node_modules/**',
                    '**/.next/**',
                    '**/data/**',
                    '**/prisma/dev.db',
                    '**/prisma/dev.db-journal',
                ],
            };

            if (isServer) {
                // Disable chunk splitting on the server in dev.
                // Next.js 14 hot-reload creates new numbered chunks (e.g. 276.js)
                // but the webpack-runtime still requires the old numbers → MODULE_NOT_FOUND crash.
                // Single-chunk output eliminates this race condition entirely.
                config.optimization = {
                    ...config.optimization,
                    splitChunks: false,
                    runtimeChunk: false,
                };
            }
        }
        return config;
    },
};

export default nextConfig;
