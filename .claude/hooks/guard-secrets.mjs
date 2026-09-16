// PreToolUse (Bash|PowerShell): bloquea comandos que mencionen secretos no versionados.
// Complementa las reglas `deny` de settings.json, que solo cubren Read/Edit.
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let command = '';
try {
  command = String(JSON.parse(raw)?.tool_input?.command ?? '');
} catch {
  process.exit(0); // payload inesperado: no bloqueamos
}

const PROTECTED = [
  // .env y .env.local/.env.production... pero no .env.example ni process.env
  { name: '.env', re: /(^|[\s"'`=/\\:(<>|;&,])\.env(?!\.example)(?![\w-])/ },
  { name: 'backend/Conexion.php', re: /(^|[^\w.])Conexion\.php\b/ },
];

const hit = PROTECTED.find((p) => p.re.test(command));
if (hit) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Bloqueado por .claude/hooks/guard-secrets.mjs: el comando menciona ${hit.name}, ` +
          'que contiene secretos y no se toca. Si es imprescindible, pide al usuario que lo haga él.',
      },
    }),
  );
}
