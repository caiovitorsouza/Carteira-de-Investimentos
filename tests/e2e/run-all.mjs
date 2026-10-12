import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const dir = fileURLToPath(new URL('./', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/TOKEN|SECRET|PASSWORD|DATABASE|RESEND|BRAPI|NODE_OPTIONS|PW_MODULE|PORT/i.test(k)));
env.EMAIL_ENABLED = 'false';
env.PORT = '8787';
const children = new Set();
function child(file, output = false) {
  const p = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url))],
    { cwd: dir, env, stdio: output ? ['ignore', 'pipe', 'pipe'] : 'ignore' });
  children.add(p);
  p.on('exit', () => children.delete(p));
  return p;
}
async function freePort() {
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', () => reject(new Error('Porta 8787 ocupada: pare o servidor local antes dos testes.')));
    s.listen(8787, '127.0.0.1', () => s.close(resolve));
  });
}
function cleanup() { for (const p of children) p.kill(); }
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
let failures = 0;
try {
  await freePort();
  for (let i = 1; i <= 9; i++) {
    let server;
    if (i <= 5) {
      server = child('server.mjs');
      let ready = false;
      for (let n = 0; n < 40; n++) {
        try {
          const r = await fetch('http://127.0.0.1:8787/__ctl?seed=1', { signal: AbortSignal.timeout(500) });
          if (r.ok) { ready = true; break; }
        } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
      if (!ready) throw new Error('Servidor fictício não iniciou.');
    }
    const test = child(`t${i}.mjs`, true);
    let output = '';
    test.stdout.on('data', b => { output += b; });
    test.stderr.on('data', b => { output += b; });
    const timer = setTimeout(() => test.kill(), 180_000);
    const code = await new Promise((resolve, reject) => {
      test.once('error', reject); test.once('exit', resolve);
    });
    clearTimeout(timer);
    if (server) {
      const exited = new Promise(r => server.once('exit', r));
      server.kill(); await exited;
    }
    const passed = (output.match(/^PASS /gm) || []).length;
    const failed = (output.match(/^FAIL /gm) || []).length;
    console.log(`t${i}: ${passed} ok, ${failed} falhas; saída ${code}`);
    if (code !== 0 || failed || !passed) {
      failures++;
      console.error(output);
      break;
    }
  }
} catch (e) { failures++; console.error(e.message); }
finally { cleanup(); }
process.exitCode = failures ? 1 : 0;
