/**
 * Plain object rather than `defineConfig` from 'vitest/config' on purpose —
 * see the repo-root vitest.config.ts for why.
 */
export default {
    test: {
        include: ["test/**/*.spec.ts"],
        environment: "node",
    },
};
