import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 90_000,
    expect: { timeout: 5_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: 'http://127.0.0.1:5174',
        trace: 'retain-on-failure',
        ...devices['Desktop Firefox'],
    },
    webServer: {
        command: 'node e2e/dev-servers.mjs',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
