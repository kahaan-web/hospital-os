import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = ['dev:api', 'dev:web'].map((script) =>
  spawn('npm', ['run', script], { cwd: root, stdio: 'inherit', shell: true, env: process.env }),
);

let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', shell: true });
    } else {
      child.kill('SIGTERM');
    }
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    stop();
    // Give taskkill a moment, then leave. A dead API or web server should not keep the other one up.
    setTimeout(() => process.exit(typeof code === 'number' && code !== 0 ? code : 0), 300);
  });
}

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
