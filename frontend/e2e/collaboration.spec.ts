import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const inviteUrl = async () =>
    (await readFile(path.join(here, '.server-url'), 'utf8')).trim();

async function openEditor(page: Page) {
    await page.goto('/');
    await page.locator('button[role="radio"]').first().click();
    await page.getByRole('button', { name: 'Empty database' }).click();
    await expect(page.getByText('Tables', { exact: true })).toBeVisible();
}

async function startHost(page: Page) {
    await page.getByTestId('collab-start').click();
    await expect(page.getByTestId('collab-state')).toContainText(/connected/i);
}

async function joinParticipant(page: Page, url: string, name: string) {
    page.once('dialog', (dialog) => dialog.accept(url));
    await page.getByTestId('collab-join').click();
    await expect(page.getByTestId('collab-state')).toContainText(/connected/i);
    page.once('dialog', (dialog) => dialog.accept(name));
    await page.getByTestId('collab-name').click();
}

test('three real browser clients join, sync, show awareness, reconnect, and observe host stop', async ({
    browser,
}) => {
    const url = await inviteUrl();
    const contexts = await Promise.all([
        browser.newContext({ viewport: { width: 1600, height: 1000 } }),
        browser.newContext({ viewport: { width: 1600, height: 1000 } }),
        browser.newContext({ viewport: { width: 1600, height: 1000 } }),
    ]);
    const [host, peerB, peerC] = await Promise.all(
        contexts.map((context) => context.newPage())
    );
    const pages = [host, peerB, peerC];
    await Promise.all(pages.map(openEditor));

    // Test-only boundary manipulation: force one host operation to carry a
    // stale entity version so the authoritative host rejection path is real.
    let tamperNextOperation = false;
    await host.routeWebSocket(
        (socketUrl) => socketUrl.pathname.startsWith('/collaborate/'),
        (route) => {
            const server = route.connectToServer();
            route.onMessage((message) => {
                if (!tamperNextOperation) {
                    server.send(message);
                    return;
                }
                const parsed = JSON.parse(message);
                if (parsed.type === 'operation') {
                    for (const id of Object.keys(parsed.entityVersions)) {
                        parsed.entityVersions[id] = 0;
                    }
                    tamperNextOperation = false;
                    server.send(JSON.stringify(parsed));
                    return;
                }
                server.send(message);
            });
        }
    );

    await startHost(host);
    await joinParticipant(peerB, url, 'Peer B');
    await joinParticipant(peerC, url, 'Peer C');

    for (const page of pages) {
        await page.getByTestId('collab-diagnostics-toggle').click();
        await expect(page.getByTestId('collab-presence')).toContainText(
            'Peer B'
        );
        await expect(page.getByTestId('collab-presence')).toContainText(
            'Peer C'
        );
    }

    // A real committed edit on the host must appear on both participants.
    await host.getByRole('button', { name: 'Add Table' }).first().click();
    for (const peer of [peerB, peerC]) {
        await expect(
            peer.getByText('table_1', { exact: true }).first()
        ).toBeVisible({ timeout: 10_000 });
    }

    // Remote cursor and selection carry peer identity.
    await host.locator('#canvas').hover({ position: { x: 500, y: 400 } });
    await expect(peerB.getByTestId('remote-cursor').first()).toBeVisible();
    await peerC.locator('[data-testid^="rf__node-"]').first().click();
    await expect(
        host
            .locator('[data-testid^="remote-selection-"]')
            .filter({ hasText: 'Peer C' })
    ).toBeVisible();

    // Host rejection is visible and rolls the optimistic edit back.
    tamperNextOperation = true;
    await host.locator('.text-editable').nth(1).dblclick();
    await host.getByPlaceholder('table_1').fill('renamed-by-host');
    await host.getByPlaceholder('table_1').press('Enter');
    await expect(host.getByText('Change rejected by host')).toBeVisible({
        timeout: 10_000,
    });
    await expect(host.getByTestId('collab-state')).toContainText(/conflict/i);

    // Leaving and rejoining the same session restores the authoritative state.
    await peerB.getByTestId('collab-disconnect').click();
    await expect(peerB.getByTestId('collab-state')).toContainText(
        /disconnected|reconnecting/i
    );
    await peerB.getByTestId('collab-reconnect').click();
    await expect(peerB.getByTestId('collab-state')).toContainText(/connected/i);
    await expect(
        peerB.getByText('table_1', { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Host stop ends the session for everyone with an explicit reason.
    await host.getByTestId('collab-start').click();
    for (const peer of [peerB, peerC]) {
        await expect(peer.getByTestId('collab-state')).toContainText(/ended/i, {
            timeout: 10_000,
        });
    }

    await Promise.all(contexts.map((context) => context.close()));
});
