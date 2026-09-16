// PostToolUse (Edit|Write): `php -l` sobre cualquier .php editado.
// Si no hay PHP instalado en la máquina, no hace nada.
import { spawnSync } from 'node:child_process';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let file = '';
try {
  const input = JSON.parse(raw);
  file = String(input?.tool_input?.file_path ?? input?.tool_response?.filePath ?? '');
} catch {
  process.exit(0);
}
if (!/\.php$/i.test(file)) process.exit(0);

const CANDIDATES = ['php', 'C:\\xampp\\php\\php.exe'];
for (const bin of CANDIDATES) {
  const res = spawnSync(bin, ['-l', file], { encoding: 'utf8' });
  if (res.error) continue; // binario no encontrado: probar el siguiente
  if (res.status === 0) process.exit(0);
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `php -l ha fallado en ${file}. Corrige el error de sintaxis antes de seguir:\n${output}`,
    }),
  );
  process.exit(0);
}
