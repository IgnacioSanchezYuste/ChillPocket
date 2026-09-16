// Stop: si hay cambios .ts/.tsx sin commitear, ejecuta `tsc --noEmit` y los tests
// de Jest relacionados antes de dar el turno por terminado.
// Guarda la firma de los cambios que ya pasaron para no repetir el trabajo.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = JSON.parse(raw || '{}');
} catch {
  // seguimos con valores por defecto
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

const status = spawnSync('git', ['status', '--porcelain=v1', '-uall'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) process.exit(0);

const tsLines = status.stdout
  .split('\n')
  .filter((l) => /\.(ts|tsx)"?$/.test(l.trim()));
if (tsLines.length === 0) process.exit(0);

// Rutas existentes (renombrados "R  a -> b": nos quedamos con la nueva).
const files = tsLines
  .map((l) => l.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''))
  .filter((f) => fs.existsSync(path.join(root, f)));

const signature = sha1(
  tsLines.join('\n') +
    files
      .map((f) => {
        const st = fs.statSync(path.join(root, f));
        return `${f}:${st.mtimeMs}:${st.size}`;
      })
      .join('\n'),
);

const cacheDir = path.join(os.tmpdir(), 'chillpocket-claude-hooks');
const cacheFile = path.join(cacheDir, `${sha1(root)}.txt`);
try {
  if (fs.readFileSync(cacheFile, 'utf8') === signature) process.exit(0);
} catch {
  // sin caché todavía
}

const tail = (text, max = 60) => {
  const lines = text.trim().split('\n');
  return lines.length > max ? [...lines.slice(0, max), `… (${lines.length - max} líneas más)`].join('\n') : text.trim();
};

const failures = [];

const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
if (fs.existsSync(tscBin)) {
  const tsc = spawnSync(process.execPath, [tscBin, '--noEmit'], { cwd: root, encoding: 'utf8' });
  if (tsc.status !== 0) failures.push(`npx tsc --noEmit:\n${tail(`${tsc.stdout}${tsc.stderr}`)}`);
}

const jestBin = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
if (fs.existsSync(jestBin) && files.length > 0) {
  const jest = spawnSync(
    process.execPath,
    [jestBin, '--findRelatedTests', ...files, '--passWithNoTests', '--silent'],
    { cwd: root, encoding: 'utf8' },
  );
  if (jest.status !== 0) failures.push(`jest --findRelatedTests:\n${tail(`${jest.stderr}${jest.stdout}`)}`);
}

if (failures.length === 0) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, signature);
  process.exit(0);
}

const report = failures.join('\n\n');
if (input.stop_hook_active) {
  // Ya se intentó arreglar una vez: avisamos al usuario sin volver a bloquear.
  process.stdout.write(JSON.stringify({ systemMessage: `Los checks siguen fallando:\n${report}` }));
} else {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        'Los checks automáticos han fallado. Arréglalos antes de terminar; si los errores vienen de ' +
        `cambios del usuario que no son tuyos, no los toques y avísale.\n\n${report}`,
    }),
  );
}
