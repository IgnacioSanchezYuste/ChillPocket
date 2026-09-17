<?php

declare(strict_types=1);

/**
 * Lee un valor de configuración: variable de entorno → constante de la clase
 * `Conexion` → constante global (así funciona con cualquiera de los estilos de
 * Conexion.php). Devuelve '' si no existe.
 */
function appConfig(string $key): string
{
    $env = getenv($key);
    if (is_string($env) && $env !== '') return $env;
    if (class_exists('Conexion', false) && defined("Conexion::$key")) {
        return (string)constant("Conexion::$key");
    }
    if (defined($key)) return (string)constant($key);
    return '';
}

/**
 * Logs de la API en ficheros dentro de backend/logs/:
 *   api-2026-W38.log  (un fichero por semana ISO, por defecto)
 *   api-2026-09.log   (un fichero por mes, con LOG_ROTATION = 'month')
 *
 * Todo lo que el código manda a error_log() (y los avisos de PHP) acaba en el
 * mismo fichero. Nunca se registran contraseñas, tokens, códigos ni cuerpos de
 * petición; los emails y las IP se guardan enmascarados.
 *
 * Configuración opcional (ver appConfig):
 *   LOG_ROTATION  'week' | 'month'                  (por defecto 'week')
 *   LOG_KEEP      nº de ficheros que se conservan     (por defecto 12)
 *   LOG_LEVEL     'debug' | 'info' | 'warning' | 'error' (por defecto 'info')
 *   LOG_TIMEZONE  zona horaria de las marcas de tiempo (por defecto 'Europe/Madrid')
 *   LOG_MAX_MB    tamaño a partir del cual el fichero solo admite avisos y errores;
 *                 al doble ya no se escribe nada más (por defecto 20)
 */
final class AppLog
{
    private const LEVELS = ['debug' => 10, 'info' => 20, 'warning' => 30, 'error' => 40];

    private static ?string $file = null;
    private static int $minLevel = 20;
    /** Nivel mínimo impuesto por el tamaño del fichero (0 = sin límite). */
    private static int $sizeLevel = 0;
    private static ?DateTimeZone $tz = null;
    private static float $start = 0.0;
    private static ?int $userId = null;

    public static function init(string $dir): void
    {
        self::$start = microtime(true);
        try {
            self::$tz = new DateTimeZone(appConfig('LOG_TIMEZONE') ?: 'Europe/Madrid');
        } catch (Throwable $e) {
            self::$tz = new DateTimeZone('UTC');
        }
        self::$minLevel = self::LEVELS[strtolower(appConfig('LOG_LEVEL'))] ?? self::LEVELS['info'];

        if (!is_dir($dir) && !@mkdir($dir, 0750, true)) return;
        if (!is_writable($dir)) return;
        self::protect($dir);

        $now = new DateTimeImmutable('now', self::$tz);
        $suffix = appConfig('LOG_ROTATION') === 'month' ? $now->format('Y-m') : $now->format('o-\WW');
        self::$file = $dir . '/api-' . $suffix . '.log';

        // Tope de tamaño: un bucle de peticiones no debe llenar el disco del hosting.
        // Pasado el tope solo entran avisos y errores; al doble, nada (ni los de PHP).
        $max  = max(1, (int)(appConfig('LOG_MAX_MB') ?: 20)) * 1048576;
        $size = (int)@filesize(self::$file);
        self::$sizeLevel = $size >= 2 * $max ? PHP_INT_MAX : ($size >= $max ? self::LEVELS['warning'] : 0);

        ini_set('log_errors', '1');
        if (self::$sizeLevel !== PHP_INT_MAX) ini_set('error_log', self::$file);

        // Limpieza oportunista de ficheros antiguos (no hay cron en Hostinger).
        if (random_int(1, 200) === 1) {
            self::prune($dir, max(1, (int)(appConfig('LOG_KEEP') ?: 12)));
        }
    }

    /** Usuario autenticado de la petición en curso (lo fija requireAuth). */
    public static function setUser(int $userId): void
    {
        self::$userId = $userId;
    }

    public static function debug(string $channel, string $message, array $context = []): void
    {
        self::write('debug', $channel, $message, $context);
    }

    public static function info(string $channel, string $message, array $context = []): void
    {
        self::write('info', $channel, $message, $context);
    }

    public static function warning(string $channel, string $message, array $context = []): void
    {
        self::write('warning', $channel, $message, $context);
    }

    public static function error(string $channel, string $message, array $context = []): void
    {
        self::write('error', $channel, $message, $context);
    }

    /** Una línea por petición: método, ruta (sin query ni ids), estado y duración. */
    public static function request(string $method, string $path, int $status, string $ip, array $extra = []): void
    {
        $ms = (int)round((microtime(true) - self::$start) * 1000);
        $level = $status >= 500 ? 'error' : ($status === 429 ? 'warning' : 'info');
        self::write($level, 'http', sprintf('%s %s %d %dms', $method, self::normalizePath($path), $status, $ms), [
            'u'  => self::$userId ?? '-',
            'ip' => self::maskIp($ip),
        ] + $extra);
    }

    public static function maskEmail(string $email): string
    {
        // Solo si es un email válido: quien escribe la contraseña en el campo del
        // email ("Clave@Secreta") no debe dejar media contraseña en el log.
        $at = strrpos($email, '@');
        if ($at === false || $at === 0 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) return '***';
        return substr($email, 0, 1) . '***' . substr($email, $at);
    }

    public static function maskIp(string $ip): string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return preg_replace('/\.\d+$/', '.0', $ip) ?? '-';
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $groups = explode(':', $ip);
            return implode(':', array_slice($groups, 0, 3)) . '::';
        }
        return '-';
    }

    private static function normalizePath(string $path): string
    {
        $path = preg_replace('#^/API_Finanzas#', '', $path) ?? $path;
        // /transactions/123/receipt → /transactions/{id}/receipt
        return preg_replace('#/\d+(?=/|$)#', '/{id}', $path) ?? $path;
    }

    private static function write(string $level, string $channel, string $message, array $context): void
    {
        $weight = self::LEVELS[$level] ?? 0;
        if ($weight < self::$minLevel || $weight < self::$sizeLevel) return;
        // Sin carpeta de logs escribible solo se conservan avisos y errores (abajo).
        if (self::$file === null && $weight < self::LEVELS['warning']) return;

        $time = (new DateTimeImmutable('now', self::$tz ?? new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
        $line = sprintf('%s %-7s %-8s %s', $time, strtoupper($level), $channel, self::clean($message));
        foreach ($context as $key => $value) {
            if (is_bool($value)) $value = $value ? 'true' : 'false';
            if (!is_scalar($value) && $value !== null) $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            $line .= ' ' . $key . '=' . self::clean((string)($value ?? 'null'));
        }
        if (self::$file === null || @file_put_contents(self::$file, $line . PHP_EOL, FILE_APPEND | LOCK_EX) === false) {
            // backend/logs no se puede escribir: al log de errores del servidor
            // (hPanel), para que un fallo no se pierda sin rastro.
            if ($weight >= self::LEVELS['warning']) error_log('[chillpocket] ' . $line);
        }
    }

    /** Una entrada = una línea: fuera saltos y caracteres de control (evita inyectar líneas falsas). */
    private static function clean(string $text): string
    {
        $text = preg_replace('/[\x00-\x1F\x7F]+/', ' ', $text) ?? '';
        // Un email que llegue dentro de un mensaje (respuesta SMTP, error de la BD,
        // ruta inexistente) se enmascara igual; los ya enmascarados ("a***@") no cambian.
        $text = preg_replace('/[A-Za-z0-9._%+\-]+(@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+)/', '***$1', $text) ?? $text;
        return strlen($text) > 500 ? substr($text, 0, 500) . '…' : $text;
    }

    /** Por si la carpeta se sube sin su .htaccess: nunca se sirve por web. */
    private static function protect(string $dir): void
    {
        $htaccess = $dir . '/.htaccess';
        if (file_exists($htaccess)) return;
        @file_put_contents($htaccess, implode(PHP_EOL, [
            '<IfModule mod_authz_core.c>',
            '    Require all denied',
            '</IfModule>',
            '<IfModule !mod_authz_core.c>',
            '    Order allow,deny',
            '    Deny from all',
            '</IfModule>',
            '',
        ]));
    }

    private static function prune(string $dir, int $keep): void
    {
        $files = glob($dir . '/api-*.log') ?: [];
        if (count($files) <= $keep) return;
        usort($files, fn(string $a, string $b): int => filemtime($a) <=> filemtime($b));
        foreach (array_slice($files, 0, count($files) - $keep) as $old) {
            @unlink($old);
        }
    }
}
