import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = ['dev:api', 'dev:web'].map((script) =>
  spawn('npm', ['run', script], { cwd: root, stdio: 'inherit', shell: true, env: process.env }),
);

function stop() {
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', shell: true });
    } else {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
