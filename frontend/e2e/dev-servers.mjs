// Starts a real Go collaboration service and Vite dev server for two-client E2E runs.
// The generated invite URL is written to e2e/.server-url so specs can join as participants.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const frontend = path.resolve(root, 'frontend');
const urlFile = path.join(here, '.server-url');

const go = spawn('go', ['run', '.'], {
    cwd: root,
    env: { ...process.env, CHARTDB_COLLABORATION_SERVER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});

let inviteUrl = '';
const parseUrl = (chunk) => {
    const text = String(chunk);
    const match = text.match(/Collaboration host URL:\s*(ws:\/\/\S+)/);
    if (match && !inviteUrl) {
        inviteUrl = match[1];
        writeFile(urlFile, inviteUrl).catch((error) => {
            console.error('could not write invite URL', error);
            process.exit(1);
        });
    }
    process.stdout.write(text);
};
go.stdout.on('data', parseUrl);
go.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));

let vite;
const startVite = () => {
    if (!inviteUrl) {
        setTimeout(startVite, 100);
        return;
    }
    vite = spawn(
        'npm',
        ['run', 'dev', '--', '--port', '5174', '--host', '127.0.0.1'],
        {
            cwd: frontend,
            env: { ...process.env, VITE_COLLABORATION_URL: inviteUrl },
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );
    vite.stdout.on('data', (chunk) => process.stdout.write(String(chunk)));
    vite.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));
};
startVite();

const shutdown = () => {
    vite?.kill('SIGTERM');
    go.kill('SIGTERM');
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
go.on('exit', (code) => {
    if (code !== 0 && code !== null) {
        console.error('collaboration service exited', code);
        vite?.kill('SIGTERM');
        process.exit(code);
    }
});
