// Every watcher process starts paused. Publishing requires local activation.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const state = path.join(root, '.rendum-auto');
fs.mkdirSync(state, { recursive: true });
const lock = path.join(state, 'lock');
const stopFile = path.join(state, 'stop');
const mode = process.argv[2] || 'once';
const pauseFile = path.join(state, 'paused');
const enabledFile = path.join(state, 'publishing-enabled.json');
const statusFile = path.join(state, 'status.json');
if (['pause', 'resume', 'status'].includes(mode)) {
  if (!fs.existsSync(lock)) throw new Error('Nenhuma automação ativa. Inicie primeiro.');
  const owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json')));
  if (mode !== 'status' && owner.mode !== 'watch') throw new Error('O ciclo de simulação não permite pausa/retomada; use stop.');
  try { process.kill(owner.pid, 0); } catch { throw new Error('Lock antigo; confira o PID antes de removê-lo.'); }
  if (mode === 'status') { console.log(fs.readFileSync(statusFile, 'utf8')); process.exit(0); }
  if (mode === 'resume') {
    fs.rmSync(pauseFile, { force: true });
    console.log('Retomada explícita solicitada; nova espera de 60 segundos.');
  } else {
    fs.writeFileSync(pauseFile, 'paused');
    // Wait for the running cycle to acknowledge that checks have stopped.
    for (let n = 0; n < 300; n++) {
      try {
        const s = JSON.parse(fs.readFileSync(statusFile));
        if (s.pid === owner.pid && s.paused && !s.checking) { console.log('Pausada; pode editar.'); process.exit(0); }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Pausa solicitada, mas sem confirmação. Não edite até confirmar status ou parar.');
  }
  process.exit(0);
}
if (mode === 'stop') {
  if (!fs.existsSync(lock)) console.log('Nenhuma simulação ativa.');
  else {
    fs.writeFileSync(stopFile, 'stop');
    for (let n = 0; n < 300 && fs.existsSync(lock); n++) await new Promise(r => setTimeout(r, 100));
    if (fs.existsSync(lock)) throw new Error('Parada solicitada, mas ainda não confirmada; confira o PID.');
    console.log('Automação encerrada; lock liberado.');
  }
  process.exit(0);
}
if (!['once', 'watch'].includes(mode)) throw new Error('Use once, watch, pause, resume, status ou stop.');
try { fs.mkdirSync(lock); }
catch { throw new Error('Outra execução está ativa (ou deixou um lock após interrupção). Não haverá execução concorrente.'); }
fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, mode, startedAt: new Date().toISOString() }));
if (mode === 'watch') fs.writeFileSync(pauseFile, 'paused');
let paused = mode === 'watch';
let stopped = false;
let checking;
function writeStatus() {
  fs.writeFileSync(statusFile, JSON.stringify({ pid: process.pid, mode, paused, checking: !!checking, stopped }));
}
writeStatus();
function finish() {
  fs.rmSync(lock, { recursive: true, force: true });
  fs.rmSync(stopFile, { force: true });
}
process.on('exit', finish);
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
  if (r.error || r.status !== 0) throw new Error(`Git falhou (${args[0]}). Confira autenticação/conflitos e o estado local/remoto antes de continuar.`);
  return r.stdout;
}
function relevant(p) {
  return !/(^|\/)(\.git|node_modules|\.wrangler|\.rendum-auto|dist|build|coverage|logs?|tmp|temp|\.cache|test-results|playwright-report)(\/|$)/i.test(p)
    && !/(^|\/)(\.env[^/]*|\.dev\.vars[^/]*|[^/]*(secret|credential)[^/]*)$/i.test(p)
    && !/\.(log|tmp|bak|swp|swo|db|sqlite3?|pem|key|pfx|p12)$/i.test(p);
}
function safety() {
  if (path.resolve(git(['rev-parse', '--show-toplevel']).trim()) !== path.resolve(root)) throw new Error('Workspace diferente do clone esperado.');
  if (!/^https:\/\/github\.com\/caiovitorsouza\/Carteira-de-Investimentos(?:\.git)?$/.test(git(['remote', 'get-url', 'origin']).trim())) throw new Error('Remoto diferente do repositório autorizado.');
  if (git(['branch', '--show-current']).trim() !== 'main') throw new Error('Branch diferente de main; pare e revise manualmente.');
  if (git(['ls-files', '-u']).trim()) throw new Error('Conflito detectado. Resolva manualmente; execução parada.');
  for (const item of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (fs.existsSync(git(['rev-parse', '--git-path', item]).trim())) throw new Error('Operação Git em andamento. Revise manualmente.');
  }
  if (git(['diff', '--cached', '--name-only']).trim()) throw new Error('Há arquivos já preparados no índice. Revise-os manualmente antes de iniciar.');
}
function candidates() {
  return git(['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'])
    .split('\0').filter(Boolean).map(line => ({ status: line.slice(0, 2), path: line.slice(3) }))
    .filter(entry => relevant(entry.path));
}
function snapshot() {
  const paths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0').filter(p => p && relevant(p)).sort();
  const hash = crypto.createHash('sha256');
  hash.update(git(['rev-parse', 'HEAD']));
  for (const p of paths) {
    hash.update(p + '\0');
    const full = path.join(root, p);
    if (!fs.existsSync(full)) { hash.update('DELETED'); continue; }
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Arquivo especial não permitido: ${p}`);
    hash.update(`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:`);
    hash.update(fs.readFileSync(full));
  }
  return hash.digest('hex');
}
function inspect(entries) {
  for (const { path: p } of entries) {
    const full = path.join(root, p);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full).toString('utf8');
    const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
      /\bAKIA[A-Z0-9]{16}\b/, /\b(?:sk_live_|sk-proj-|re_)[A-Za-z0-9_-]{20,}/,
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/];
    if (patterns.some(r => r.test(text))) throw new Error(`Possível credencial em ${p}. Revise manualmente; conteúdo não exibido.`);
    const connections = text.match(/postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/g) || [];
    if (connections.some(s => !/[<\[]|YOUR_|SUA_|example|teste/i.test(s))) throw new Error(`Possível credencial em ${p}. Revise manualmente; conteúdo não exibido.`);
  }
}
function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line); fs.appendFileSync(path.join(state, 'simulation.log'), line + '\n');
}
async function checks() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
    !/TOKEN|SECRET|PASSWORD|DATABASE|RESEND|BRAPI|NODE_OPTIONS|NODE_EXTRA_CA_CERTS/i.test(k)));
  checking = spawn(process.execPath, ['scripts/check-project.mjs'], { cwd: root, env, stdio: 'inherit' });
  writeStatus();
  const result = await new Promise((resolve, reject) => {
    checking.once('error', reject); checking.once('exit', code => resolve(code));
  });
  checking = undefined;
  writeStatus();
  return result;
}
function publishingEnabled() {
  try {
    const config = JSON.parse(fs.readFileSync(enabledFile));
    return config.repository === 'caiovitorsouza/Carteira-de-Investimentos'
      && config.branch === 'main' && config.integrationConfirmed === true;
  } catch { return false; }
}
function interrupted() {
  return stopped || fs.existsSync(stopFile) || (mode === 'watch' && fs.existsSync(pauseFile));
}
function publish(entries, cycle) {
  if (!publishingEnabled()) throw new Error('Integração ainda não confirmada/ativada; envio bloqueado.');
  git(['fetch', 'origin', 'main']);
  if (git(['rev-parse', 'HEAD']).trim() !== git(['rev-parse', 'origin/main']).trim()) {
    throw new Error('main local e remota diferem. Revise manualmente; sem pull ou force push.');
  }
  safety();
  if (interrupted() || snapshot() !== cycle) return false;
  const paths = entries.map(e => e.path);
  try {
    git(['add', '--', ...paths]);
    if (interrupted() || snapshot() !== cycle) return false;
    const staged = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean).sort();
    if (JSON.stringify(staged) !== JSON.stringify([...paths].sort())) throw new Error('Índice inesperado.');
    inspect(entries);
    if (interrupted()) return false;
    git(['commit', '-m', 'chore: alterações validadas pela automação local']);
    log(`Commit criado: ${git(['rev-parse', 'HEAD']).trim()}`);
  } finally {
    // Unstage only this cycle's paths; never discard working tree edits.
    git(['reset', '--quiet', 'HEAD', '--', ...paths]);
  }
  if (interrupted()) throw new Error('Pausa/parada após commit; push pendente para revisão manual.');
  git(['push', 'origin', 'HEAD:main']);
  log('Push concluído. Build e publicação devem ser confirmados no Cloudflare.');
  return true;
}
async function main() {
  safety();
  let fingerprint = snapshot();
  let lastEdit = Date.now();
  let processed;
  if (mode === 'watch') {
    try {
      const previous = JSON.parse(fs.readFileSync(path.join(state, 'validated-candidates.json'), 'utf8'));
      if (previous.mode === 'simulation' && previous.fingerprint === fingerprint) processed = fingerprint;
    } catch {}
  }
  log(mode === 'once' ? 'SIMULAÇÃO: sem envio; aguardando 60 segundos.' : 'Iniciada PAUSADA. Retome explicitamente para validar e enviar.');
  const monitor = setInterval(() => {
    try {
      if (fs.existsSync(stopFile)) stopped = true;
      const nextPaused = mode === 'watch' && fs.existsSync(pauseFile);
      if (nextPaused !== paused) { paused = nextPaused; lastEdit = Date.now(); processed = undefined; }
      const current = snapshot();
      if (current !== fingerprint) { fingerprint = current; lastEdit = Date.now(); }
    } catch (e) { stopped = true; log(e.message); }
    if ((stopped || paused) && checking) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(checking.pid), '/T', '/F'], { stdio: 'ignore' });
      else checking.kill('SIGTERM');
    }
    writeStatus();
  }, 1000);
  try {
    while (!stopped) {
      await new Promise(r => setTimeout(r, 1000));
      if (paused) continue;
      if (Date.now() - lastEdit < 60_000 || fingerprint === processed) continue;
      safety();
      const entries = candidates();
      if (!entries.length) {
        log('Nenhum arquivo relevante entraria no commit.'); processed = fingerprint;
        if (mode === 'once') return;
        continue;
      }
      inspect(entries);
      const cycle = fingerprint;
      log('Arquivos candidatos (inclui alterações preexistentes; somente identificação):');
      for (const entry of entries) log(`${entry.status} ${entry.path}`);
      const code = await checks();
      if (stopped) return;
      if (interrupted()) { lastEdit = Date.now(); continue; }
      const current = snapshot();
      if (current !== cycle || fingerprint !== cycle) {
        fingerprint = current; lastEdit = Date.now();
        log('Edições durante as verificações: ciclo descartado. Nova validação após 60 segundos.');
        continue;
      }
      if (code !== 0) throw new Error('Verificação falhou. Automação parada; este ciclo não criou commit nem push.');
      safety();
      fs.writeFileSync(path.join(state, 'validated-candidates.json'), JSON.stringify({
        mode: mode === 'once' ? 'simulation' : 'automation', head: git(['rev-parse', 'HEAD']).trim(), fingerprint: cycle,
        validatedAt: new Date().toISOString(), entries, publishingEnabled: mode === 'watch' && publishingEnabled()
      }, null, 2));
      log('Validação aprovada. Lista em .rendum-auto/validated-candidates.json.');
      if (mode === 'watch') {
        if (!publish(entries, cycle)) { lastEdit = Date.now(); continue; }
        fingerprint = snapshot();
      }
      processed = fingerprint;
      if (mode === 'once') return;
    }
  } finally { clearInterval(monitor); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
