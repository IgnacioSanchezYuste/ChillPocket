<?php

declare(strict_types=1);

// Importante: evitar que warnings/notices de PHP se cuelen en el body JSON.
// Si se mezclan con el JSON la respuesta deja de parsear en el cliente.
// Los errores siguen registrándose en el log del servidor.
ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use Slim\Exception\HttpException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

require __DIR__ . "/vendor/autoload.php";
require __DIR__ . "/Conexion.php";
require __DIR__ . "/Logger.php";
AppLog::init(__DIR__ . '/logs');
require __DIR__ . "/Mailer.php";

// ================= CONFIG =================
// El secreto JWT NUNCA va en el repo. Se busca, en este orden:
//   1) variable de entorno JWT_SECRET
//   2) constante de clase  Conexion::JWT_SECRET_CONFIG  (en Conexion.php, no versionado)
//   3) constante global    JWT_SECRET_CONFIG
// Si no está configurado, abortamos (fail-closed): jamás firmamos con un
// secreto público/por defecto, porque permitiría forjar sesiones.
$__jwtSecret = getenv('JWT_SECRET') ?: '';
if ($__jwtSecret === '' && defined('Conexion::JWT_SECRET_CONFIG')) {
    $__jwtSecret = (string) Conexion::JWT_SECRET_CONFIG;
}
if ($__jwtSecret === '' && defined('JWT_SECRET_CONFIG')) {
    $__jwtSecret = (string) JWT_SECRET_CONFIG;
}
if ($__jwtSecret === '' || $__jwtSecret === 'cambia_este_secreto_en_produccion') {
    AppLog::error('config', 'JWT_SECRET no configurado: la API no puede arrancar');
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => true, 'message' => 'Servidor mal configurado']);
    exit;
}
define('JWT_SECRET', $__jwtSecret);
// Antes 3600s (1h) - causaba cierre de sesión durante el uso normal.
// 7 días es un compromiso razonable para una app personal en hosting propio.
define('JWT_EXPIRATION', 7 * 24 * 3600);
define('ALLOWED_METHODS', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
define('ALLOWED_HEADERS', 'Authorization, Content-Type, Accept, Origin, X-Requested-With');

// =====================================================
// GOOGLE OAUTH
// =====================================================
// Lista de "audiences" válidos. El ID token de Google llevará uno de
// estos en el claim `aud`. Hay que aceptar TODOS los client IDs que
// uses (web, android, ios). Lo idóneo es pasarlos por variables de
// entorno; aquí dejamos un fallback editable.
define('GOOGLE_ALLOWED_CLIENT_IDS', array_filter([
    getenv('GOOGLE_WEB_CLIENT_ID')     ?: '1034342077931-haog5h9b2rmricio9bvr0lt3phpvgba7.apps.googleusercontent.com',
    getenv('GOOGLE_ANDROID_CLIENT_ID') ?: '1034342077931-3auesgkpepgh13316hclrdkgbs0hubsg.apps.googleusercontent.com',
    getenv('GOOGLE_IOS_CLIENT_ID')     ?: null,
]));

// ================= EARLY CORS (preflight short-circuit) =================
// Si el navegador hace preflight OPTIONS lo respondemos antes de cargar
// el router de Slim para evitar problemas con mod_security / proxys.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: ' . ALLOWED_METHODS);
    header('Access-Control-Allow-Headers: ' . ALLOWED_HEADERS);
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

$app = AppFactory::create();
$app->setBasePath('/API_Finanzas');
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

// ================= CORS (post-routing, para respuestas normales) =================
$app->add(function (Request $request, RequestHandlerInterface $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
        ->withHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
});

// ================= QUERY STRING =================
// Ningún endpoint usa listas en la query: `?from[]=x` se descarta aquí en vez de
// acabar en un TypeError (500) dentro del handler.
$app->add(function (Request $request, RequestHandlerInterface $handler) {
    $query = $request->getQueryParams();
    $strings = array_filter($query, 'is_string');
    if (count($strings) !== count($query)) $request = $request->withQueryParams($strings);
    return $handler->handle($request);
});

// ================= LOG DE PETICIONES =================
$app->add(function (Request $request, RequestHandlerInterface $handler) {
    $response = $handler->handle($request);
    AppLog::request($request->getMethod(), $request->getUri()->getPath(), $response->getStatusCode(), clientIp($request));
    return $response;
});

// ================= ERRORES =================
// Última capa: cualquier excepción sin capturar (o una ruta inexistente) se
// registra en el log y el cliente recibe un JSON neutro, nunca HTML ni detalles.
$errorMiddleware = $app->addErrorMiddleware(false, false, false);
$errorMiddleware->setDefaultErrorHandler(function (Request $request, Throwable $e) use ($app) {
    $status = $e instanceof HttpException ? (int)$e->getCode() : 500;
    if ($status < 400 || $status > 599) $status = 500;
    $extra = [];
    if ($status >= 500) {
        $extra['error'] = get_class($e) . ': ' . $e->getMessage();
        $extra['at'] = basename($e->getFile()) . ':' . $e->getLine();
    }
    AppLog::request($request->getMethod(), $request->getUri()->getPath(), $status, clientIp($request), $extra);
    $message = match ($status) {
        404 => 'Ruta no encontrada',
        405 => 'Método no permitido',
        default => $status >= 500 ? 'Error interno del servidor' : 'Petición no válida',
    };
    return jsonResponse($app->getResponseFactory()->createResponse($status), ['error' => true, 'message' => $message], $status)
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
        ->withHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
});

// ================= DB =================
$conn = Conexion::getPDO();
if (!$conn instanceof PDO) {
    AppLog::error('db', 'Sin conexión a la base de datos (Conexion::getPDO devolvió null)');
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => true, 'message' => 'Servicio no disponible. Inténtalo en unos minutos.']);
    exit;
}
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// ================= HELPERS =================
function jsonResponse(Response $response, $data, int $status = 200): Response {
    $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
    return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
}

function authenticate(Request $request): ?array {
    $authHeader = $request->getHeaderLine('Authorization');
    if (!$authHeader || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) return null;
    try {
        $decoded = JWT::decode($matches[1], new Key(JWT_SECRET, 'HS256'));
        return (array)$decoded;
    } catch (Throwable $e) { return null; }
}

// Campos de `users` que se devuelven al cliente. Se lee con SELECT * y se filtra
// aquí: así no se rompe nada si una migración aún no está aplicada, y nunca
// salen password_hash ni google_sub.
const USER_PUBLIC_FIELDS = [
    'id', 'name', 'email', 'currency', 'timezone', 'avatar_url', 'theme', 'created_at',
    'income_reference', 'income_payday', 'savings_goal_monthly',
];

function fetchUser(PDO $conn, int $userId): ?array {
    $stmt = $conn->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    $user = [];
    foreach (USER_PUBLIC_FIELDS as $field) {
        if (array_key_exists($field, $row)) $user[$field] = $row[$field];
    }
    foreach (['income_reference', 'savings_goal_monthly'] as $field) {
        if (isset($user[$field])) $user[$field] = (float)$user[$field];
    }
    if (isset($user['income_payday'])) $user['income_payday'] = (int)$user['income_payday'];
    $user['email_verified'] = !empty($row['email_verified_at']);
    // Solo con el email verificado: si no, alguien podría registrar primero el
    // email de administrador (si aún no tiene cuenta) y obtener el panel.
    $user['is_admin'] = $user['email_verified'] && isAdminEmail((string)($row['email'] ?? ''));
    return $user;
}

/** ADMIN_EMAILS (Conexion.php o entorno): emails separados por comas. */
function isAdminEmail(string $email): bool {
    if ($email === '') return false;
    $admins = array_filter(array_map(
        fn(string $e): string => strtolower(trim($e)),
        explode(',', appConfig('ADMIN_EMAILS'))
    ));
    return in_array(strtolower($email), $admins, true);
}

/** Usuario de la petición si es administrador; null si no. */
function adminUser(PDO $conn, Request $request): ?array {
    $jwt  = $request->getAttribute('user');
    $user = fetchUser($conn, (int)($jwt['user_id'] ?? 0));
    return ($user && !empty($user['is_admin'])) ? $user : null;
}

/** ¿Tiene el usuario importes guardados? (cambiar solo el símbolo los falsearía). */
function userHasMoneyData(PDO $conn, int $userId): bool {
    $st = $conn->prepare("
        SELECT EXISTS(SELECT 1 FROM transactions       WHERE user_id = :a)
            OR EXISTS(SELECT 1 FROM recurring_expenses WHERE user_id = :b)
            OR EXISTS(SELECT 1 FROM savings_goals      WHERE user_id = :c)
            OR EXISTS(SELECT 1 FROM budgets            WHERE user_id = :d)
    ");
    $st->execute([':a' => $userId, ':b' => $userId, ':c' => $userId, ':d' => $userId]);
    return (bool)$st->fetchColumn();
}

// POST /usage: filas (evento × plataforma) nuevas admitidas por día. Acota el
// tamaño de usage_daily aunque un cliente mande nombres inventados.
const USAGE_MAX_ROWS_PER_DAY = 1000;

// =====================================================
// DIVISAS · tipos de cambio (BCE vía frankfurter.dev, cacheados 12 h)
// =====================================================
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN'];
const EXCHANGE_RATE_TTL_HOURS = 12;
const EXCHANGE_RATE_SOURCE = 'Banco Central Europeo (frankfurter.dev)';

/**
 * 1 $from = rate $to. Usa la caché de exchange_rates (compartida entre usuarios:
 * como mucho una llamada externa por par cada 12 h). Si la API externa falla, se
 * usa el último valor guardado aunque esté caducado. null si no hay ninguno.
 */
function exchangeRate(PDO $conn, string $from, string $to): ?array {
    if ($from === $to) return ['rate' => 1.0, 'date' => date('Y-m-d')];
    // Solo pares de la lista blanca: la URL externa nunca lleva otra cosa, y una
    // cuenta con una moneda fuera de la lista no provoca una llamada por petición.
    if (!in_array($from, SUPPORTED_CURRENCIES, true) || !in_array($to, SUPPORTED_CURRENCIES, true)) return null;

    $sel = $conn->prepare("
        SELECT rate, rate_date, fetched_at >= DATE_SUB(NOW(), INTERVAL " . (int)EXCHANGE_RATE_TTL_HOURS . " HOUR) AS fresh
        FROM exchange_rates WHERE base = :b AND quote = :q LIMIT 1
    ");
    $sel->execute([':b' => $from, ':q' => $to]);
    $cached = $sel->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($cached && (int)$cached['fresh'] === 1) {
        return ['rate' => (float)$cached['rate'], 'date' => (string)$cached['rate_date']];
    }

    // $from y $to están en SUPPORTED_CURRENCIES (comprobado arriba): URL segura.
    $raw  = httpGetRaw('https://api.frankfurter.dev/v1/latest?base=' . rawurlencode($from) . '&symbols=' . rawurlencode($to));
    $json = $raw !== null ? json_decode($raw, true) : null;
    $rate = is_array($json) ? ($json['rates'][$to] ?? null) : null;
    $date = is_array($json) ? (string)($json['date'] ?? '') : '';
    // Sin confianza ciega en la respuesta: número finito, en un rango plausible
    // (y que quepa en DECIMAL(18,8) sin redondear a 0) y fecha con formato.
    $plausible = is_numeric($rate) && is_finite((float)$rate)
        && (float)$rate >= 0.0001 && (float)$rate <= 100000;
    if ($plausible && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $conn->prepare("
            INSERT INTO exchange_rates (base, quote, rate, rate_date, fetched_at)
            VALUES (:b, :q, :r, :d, NOW())
            ON DUPLICATE KEY UPDATE rate = VALUES(rate), rate_date = VALUES(rate_date), fetched_at = NOW()
        ")->execute([':b' => $from, ':q' => $to, ':r' => (string)$rate, ':d' => $date]);
        return ['rate' => (float)$rate, 'date' => $date];
    }

    AppLog::warning('currency', "no se pudo obtener el cambio {$from}→{$to}", ['cache' => $cached ? 'caducada' : 'vacía']);
    if ($cached) {
        // Con la API caída no se reintenta en cada petición (cada intento puede
        // tardar hasta el timeout): el siguiente, dentro de 15 minutos.
        try {
            $conn->prepare("
                UPDATE exchange_rates
                SET fetched_at = DATE_SUB(NOW(), INTERVAL " . ((int)EXCHANGE_RATE_TTL_HOURS * 60 - 15) . " MINUTE)
                WHERE base = :b AND quote = :q
            ")->execute([':b' => $from, ':q' => $to]);
        } catch (Throwable $e) { /* solo es una espera */ }
    }
    return $cached ? ['rate' => (float)$cached['rate'], 'date' => (string)$cached['rate_date']] : null;
}

function tokenForUser(array $user): string {
    $payload = [
        'user_id'  => (int)$user['id'],
        'name'     => $user['name'],
        'email'    => $user['email'],
        'currency' => $user['currency'] ?? 'EUR',
        'iat'      => time(),
        'exp'      => time() + JWT_EXPIRATION
    ];
    return JWT::encode($payload, JWT_SECRET, 'HS256');
}

function validHexColor(?string $color, string $fallback = '#6366F1'): string {
    if ($color && preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) return strtoupper($color);
    return $fallback;
}

function validDate(?string $date): bool {
    return is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1;
}

function validMonthYear(?string $value): bool {
    return is_string($value) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $value) === 1;
}

function validPaymentMethod(?string $method): bool {
    if ($method === null || $method === '') return true;
    return in_array($method, ['cash','debit_card','credit_card','bizum','transfer','other'], true);
}

function validScope(?string $scope): bool {
    return $scope === null || $scope === '' || in_array($scope, ['month','historical'], true);
}

function userCanUseCategory(PDO $conn, int $userId, int $categoryId): bool {
    $stmt = $conn->prepare("
        SELECT id FROM categories
        WHERE id = :id AND (user_id = :u OR user_id IS NULL)
        LIMIT 1
    ");
    $stmt->execute([':id'=>$categoryId, ':u'=>$userId]);
    return (bool)$stmt->fetch();
}

function userOwnsCategory(PDO $conn, int $userId, int $categoryId): bool {
    $stmt = $conn->prepare("
        SELECT id FROM categories
        WHERE id = :id AND user_id = :u
        LIMIT 1
    ");
    $stmt->execute([':id'=>$categoryId, ':u'=>$userId]);
    return (bool)$stmt->fetch();
}

function monthlyEquivalent(float $amount, string $frequency): float {
    return match ($frequency) {
        'weekly'  => $amount * 4.345,
        'monthly' => $amount,
        'yearly'  => $amount / 12,
        default   => $amount
    };
}

// Saldo disponible del usuario = SUM(income) - SUM(expense) sobre TODAS sus
// transacciones. Las contribuciones a metas ya cuentan como expense, las
// retiradas como income, así que esto refleja el dinero realmente "libre".
function availableBalance(PDO $conn, int $userId): float {
    $stmt = $conn->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS balance
        FROM transactions WHERE user_id = :u
    ");
    $stmt->execute([':u' => $userId]);
    return (float)($stmt->fetch(PDO::FETCH_ASSOC)['balance'] ?? 0);
}

/**
 * Saldo "del mes" disponible para aportar a meta o gastar (Fase 4).
 * = SUM(income scope='month' desde periodStart) − SUM(expense scope='month' desde periodStart)
 * No incluye scope='historical' (esas viven en "Mis ahorros") ni transacciones
 * de periodos anteriores (ya cerrados como surplus).
 */
function currentPeriodAvailable(PDO $conn, int $userId): float {
    $periodStart = currentPeriodStart($conn, $userId);
    $stmt = $conn->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type='income'  AND scope='month' THEN amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type='expense' AND scope='month' THEN amount ELSE 0 END), 0) AS bal
        FROM transactions
        WHERE user_id = :u AND transaction_date >= :ps
    ");
    $stmt->execute([':u' => $userId, ':ps' => $periodStart]);
    return (float)($stmt->fetch(PDO::FETCH_ASSOC)['bal'] ?? 0);
}

/**
 * Saldo "histórico" disponible — "Mis ahorros" (Fase 4).
 * = SUM(monthly_closures.surplus) + SUM(income scope='historical') − SUM(expense scope='historical')
 *   + transferencias (gasto del mes hacia ahorro − ingreso del mes desde ahorro)
 * Misma fórmula que summary.net_total_historical (la fuente de verdad).
 */
const HISTORICAL_TX_SQL = "
    COALESCE(SUM(CASE WHEN t.type='income'  AND t.scope='historical' THEN t.amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.type='expense' AND t.scope='historical' THEN t.amount ELSE 0 END), 0)
  + COALESCE(SUM(CASE WHEN t.transfer > 0 AND t.type='expense' THEN t.amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.transfer > 0 AND t.type='income'  THEN t.amount ELSE 0 END), 0)
";

function historicalAvailable(PDO $conn, int $userId): float {
    $stmt = $conn->prepare("
        SELECT
            COALESCE((SELECT SUM(mc.surplus) FROM monthly_closures mc WHERE mc.user_id = :u), 0)
          + " . HISTORICAL_TX_SQL . " AS bal
        FROM transactions t
        WHERE t.user_id = :u
    ");
    $stmt->execute([':u' => $userId]);
    return (float)($stmt->fetch(PDO::FETCH_ASSOC)['bal'] ?? 0);
}

// =====================================================
// RATE LIMITING · /auth/*
// =====================================================
// Bloquea 5 intentos fallidos en 15 min, por IP y por email (lo que dispare antes).
// La cuenta se "olvida" al completar un login/register/google con éxito.

function clientIp(Request $req): string {
    $s = $req->getServerParams();
    // Hostinger detrás de un proxy: X-Forwarded-For trae la IP real del cliente.
    $xff = $s['HTTP_X_FORWARDED_FOR'] ?? '';
    if (is_string($xff) && $xff !== '') {
        $first = trim(explode(',', $xff)[0]);
        if ($first !== '') return $first;
    }
    return (string)($s['REMOTE_ADDR'] ?? '0.0.0.0');
}

// bucket_key es VARCHAR(128): un email largo no cabría (el INSERT fallaría en
// silencio y ese email quedaría sin límite). Por encima de 120 bytes se usa su hash.
function authEmailBucket(string $email): string {
    $email = strtolower($email);
    return 'email:' . (strlen($email) > 120 ? 'h:' . hash('sha256', $email) : $email);
}

function authIpBucket(Request $req): string {
    return 'ip:' . substr(clientIp($req), 0, 64);
}

/**
 * Devuelve true si el cliente puede intentar (dentro de los límites), false si está bloqueado.
 * Cuenta intentos en la ventana, sumando por ip y por email por separado.
 * La ventana se calcula con NOW() de la BD (igual que attempted_at): si PHP y
 * MySQL tienen zonas horarias distintas, la ventana no se descuadra.
 */
function checkAuthRateLimit(PDO $conn, Request $req, string $endpoint, ?string $email = null, int $maxAttempts = 5, int $windowMin = 15): bool {
    $windowMin = max(1, $windowMin); // entero controlado por el código
    $buckets = [authIpBucket($req)];
    if ($email !== null && $email !== '') $buckets[] = authEmailBucket($email);
    $stmt = $conn->prepare("
        SELECT COUNT(*) FROM auth_attempts
        WHERE bucket_key = :b AND endpoint = :e
          AND attempted_at >= DATE_SUB(NOW(), INTERVAL $windowMin MINUTE)
    ");
    foreach ($buckets as $b) {
        $stmt->execute([':b' => $b, ':e' => $endpoint]);
        if ((int)$stmt->fetchColumn() >= $maxAttempts) {
            AppLog::warning('auth', "límite alcanzado: $endpoint", [
                'por' => str_starts_with($b, 'ip:') ? 'ip' : 'email',
                'email' => $email ? AppLog::maskEmail($email) : '-',
            ]);
            return false;
        }
    }
    return true;
}

/**
 * Tope de 24 h solo por email (la IP la comparten NAT/CGNAT y X-Forwarded-For
 * se puede falsificar). Frena la fuerza bruta lenta de códigos de 6 dígitos y
 * el bombardeo de correos a una misma dirección.
 */
function checkEmailDailyLimit(PDO $conn, string $endpoint, string $email, int $maxPerDay): bool {
    if ($email === '') return true;
    $stmt = $conn->prepare("
        SELECT COUNT(*) FROM auth_attempts
        WHERE bucket_key = :b AND endpoint = :e
          AND attempted_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
    ");
    $stmt->execute([':b' => authEmailBucket($email), ':e' => $endpoint]);
    return (int)$stmt->fetchColumn() < $maxPerDay;
}

function recordAuthFailure(PDO $conn, Request $req, string $endpoint, ?string $email = null): void {
    AppLog::info('auth', "intento registrado: $endpoint", ['email' => $email ? AppLog::maskEmail($email) : '-']);
    $ins = $conn->prepare("INSERT INTO auth_attempts (bucket_key, endpoint) VALUES (:b, :e)");
    try { $ins->execute([':b' => authIpBucket($req), ':e' => $endpoint]); } catch (Throwable $err) {}
    if ($email !== null && $email !== '') {
        try { $ins->execute([':b' => authEmailBucket($email), ':e' => $endpoint]); } catch (Throwable $err) {}
    }
    // Limpieza oportunista (1/100): borra registros > 7 días para no engordar la tabla.
    if (random_int(1, 100) === 1) {
        try { $conn->exec("DELETE FROM auth_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"); } catch (Throwable $err) {}
    }
}

function clearAuthAttempts(PDO $conn, Request $req, string $endpoint, ?string $email = null): void {
    $del = $conn->prepare("DELETE FROM auth_attempts WHERE bucket_key = :b AND endpoint = :e");
    try { $del->execute([':b' => authIpBucket($req), ':e' => $endpoint]); } catch (Throwable $err) {}
    if ($email !== null && $email !== '') {
        try { $del->execute([':b' => authEmailBucket($email), ':e' => $endpoint]); } catch (Throwable $err) {}
    }
}

/** Respuesta estándar 429. */
function rateLimitedResponse(Response $response, int $windowMin = 15): Response {
    return jsonResponse($response, [
        'error'   => true,
        'code'    => 'rate_limited',
        'message' => "Demasiados intentos. Inténtalo de nuevo en unos minutos.",
        'retry_after_minutes' => $windowMin,
    ], 429);
}

// =====================================================
// BILLING · entitlements del usuario
// =====================================================
// Devuelve el plan activo del usuario (o 'free') con sus límites y features.
// Si no hay fila activa en user_entitlements → 'free'. Si hay varias activas,
// se queda con la de mayor "rango" (pro_freelance > family > plus > free).
// `plan_id` manda (es la columna que se edita a mano); `plan_code` es el respaldo
// de filas antiguas y se corrige sola si no coincide.
function getUserEntitlements(PDO $conn, int $userId): array {
    $row = null;
    try {
        $stmt = $conn->prepare("
            SELECT e.id AS ent_id, e.plan_code AS stored_code, e.source, e.expires_at,
                   p.code AS plan_code, p.name, p.limits_json, p.features_json
            FROM user_entitlements e
            JOIN plans p ON p.id = COALESCE(
                e.plan_id,
                (SELECT p2.id FROM plans p2 WHERE p2.code = e.plan_code LIMIT 1)
            )
            WHERE e.user_id = :u
              AND e.is_active = 1
              AND (e.expires_at IS NULL OR e.expires_at >= CURDATE())
            ORDER BY
              CASE p.code
                WHEN 'pro_freelance' THEN 4
                WHEN 'family'        THEN 3
                WHEN 'plus'          THEN 2
                ELSE 1
              END DESC,
              (e.expires_at IS NULL) DESC, -- a igual plan, la fila permanente (early adopter, lifetime, manual)
              e.id DESC
            LIMIT 1
        ");
        $stmt->execute([':u' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

        if ($row && $row['stored_code'] !== $row['plan_code']) {
            try {
                $conn->prepare("UPDATE user_entitlements SET plan_code = :c WHERE id = :id")
                     ->execute([':c' => $row['plan_code'], ':id' => $row['ent_id']]);
            } catch (Throwable $e) {
                error_log('[entitlements] no se pudo sincronizar plan_code: ' . $e->getMessage());
            }
        }
    } catch (PDOException $e) {
        // Migración §11 (plan_id) aún sin aplicar: consulta por plan_code.
        $stmt = $conn->prepare("
            SELECT e.source, e.expires_at, p.code AS plan_code, p.name, p.limits_json, p.features_json
            FROM user_entitlements e
            JOIN plans p ON p.code = e.plan_code
            WHERE e.user_id = :u
              AND e.is_active = 1
              AND (e.expires_at IS NULL OR e.expires_at >= CURDATE())
            ORDER BY
              CASE p.code
                WHEN 'pro_freelance' THEN 4
                WHEN 'family'        THEN 3
                WHEN 'plus'          THEN 2
                ELSE 1
              END DESC
            LIMIT 1
        ");
        $stmt->execute([':u' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$row) {
        $p = $conn->prepare("SELECT code AS plan_code, name, limits_json, features_json FROM plans WHERE code = 'free' LIMIT 1");
        $p->execute();
        $row = ($p->fetch(PDO::FETCH_ASSOC) ?: []) + ['plan_code' => 'free', 'source' => null, 'expires_at' => null];
    }

    $planCode = (string)$row['plan_code'];
    $limits   = json_decode((string)($row['limits_json'] ?? ''), true) ?: [];
    $features = json_decode((string)($row['features_json'] ?? ''), true) ?: [];

    return [
        'plan_code'      => $planCode,
        'plan_name'      => $row['name'] ?? 'Gratis',
        'plan_source'    => $row['source'] ?? null,
        'plan_expires_at'=> $row['expires_at'] ?? null,
        'limits'         => $limits,
        'features'       => $features,
        'is_premium'     => $planCode !== 'free',
        'is_web_allowed' => (bool)($features['web_access'] ?? false),
    ];
}

// Crea la fila base del plan (gratis, source='manual') de un usuario nuevo.
// Es la fila que se edita a mano para cambiarle el plan. Si la migración §11
// aún no está aplicada, se registra el error y el usuario queda en gratis igual.
function createBaseEntitlement(PDO $conn, int $userId): void {
    try {
        $conn->prepare("
            INSERT INTO user_entitlements (user_id, plan_code, plan_id, is_active, source)
            SELECT :u, p.code, p.id, 1, 'manual' FROM plans p WHERE p.code = 'free' LIMIT 1
        ")->execute([':u' => $userId]);
    } catch (Throwable $e) {
        error_log('[entitlements] fila base no creada: ' . $e->getMessage());
    }
}

// =====================================================
// EMAIL · códigos de verificación y recuperación (§12)
// =====================================================
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const EMAIL_CODE_TTL_VERIFY   = 60; // minutos
const EMAIL_CODE_TTL_RESET    = 15; // minutos
// Topes de 24 h por email (además de los de 15 min): envíos y códigos fallidos.
const EMAIL_SENDS_PER_DAY     = 10;
const EMAIL_CODE_FAILS_PER_DAY = 15;

// Solo se guarda el HMAC del código: un volcado de la BD no permite usarlos.
function emailCodeHash(string $code): string {
    return hash_hmac('sha256', $code, JWT_SECRET);
}

// Genera un código de 6 dígitos e invalida los anteriores del mismo propósito.
function issueEmailCode(PDO $conn, int $userId, string $purpose, int $ttlMinutes): string {
    $conn->prepare("UPDATE email_codes SET used_at = NOW() WHERE user_id = :u AND purpose = :p AND used_at IS NULL")
         ->execute([':u' => $userId, ':p' => $purpose]);

    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $ttl  = max(1, $ttlMinutes); // entero controlado por el código, no por el cliente
    $conn->prepare("
        INSERT INTO email_codes (user_id, purpose, code_hash, expires_at)
        VALUES (:u, :p, :h, DATE_ADD(NOW(), INTERVAL $ttl MINUTE))
    ")->execute([':u' => $userId, ':p' => $purpose, ':h' => emailCodeHash($code)]);

    // Limpieza oportunista (sin cron en Hostinger).
    if (random_int(1, 20) === 1) {
        try { $conn->exec("DELETE FROM email_codes WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"); } catch (Throwable $e) {}
    }
    return $code;
}

// Valida y consume un código. Cada intento (también el bueno) gasta uno de los
// 5 disponibles; agotados, el código muere.
function consumeEmailCode(PDO $conn, int $userId, string $purpose, string $code): bool {
    if (!preg_match('/^\d{6}$/', $code)) return false;

    $stmt = $conn->prepare("
        SELECT id, code_hash FROM email_codes
        WHERE user_id = :u AND purpose = :p AND used_at IS NULL AND expires_at >= NOW()
        ORDER BY id DESC LIMIT 1
    ");
    $stmt->execute([':u' => $userId, ':p' => $purpose]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return false;

    // Reserva atómica del intento ANTES de comparar: con peticiones en paralelo,
    // leer `attempts` y sumar después permitía probar muchos más de 5 códigos.
    $max = (int)EMAIL_CODE_MAX_ATTEMPTS;
    $try = $conn->prepare("
        UPDATE email_codes SET attempts = attempts + 1
        WHERE id = :id AND used_at IS NULL AND attempts < $max
    ");
    $try->execute([':id' => $row['id']]);
    if ($try->rowCount() !== 1) return false;

    if (!hash_equals((string)$row['code_hash'], emailCodeHash($code))) return false;

    // Consumo atómico: dos peticiones simultáneas no pueden usar el mismo código.
    $upd = $conn->prepare("UPDATE email_codes SET used_at = NOW() WHERE id = :id AND used_at IS NULL");
    $upd->execute([':id' => $row['id']]);
    if ($upd->rowCount() !== 1) return false;

    // Dos emisiones simultáneas pueden dejar otro código vivo: se anula también.
    $conn->prepare("UPDATE email_codes SET used_at = NOW() WHERE user_id = :u AND purpose = :p AND used_at IS NULL")
         ->execute([':u' => $userId, ':p' => $purpose]);
    return true;
}

function markEmailVerified(PDO $conn, int $userId): void {
    try {
        $conn->prepare("UPDATE users SET email_verified_at = NOW() WHERE id = :id AND email_verified_at IS NULL")
             ->execute([':id' => $userId]);
    } catch (Throwable $e) {
        error_log('[email] no se pudo marcar como verificado: ' . $e->getMessage());
    }
}

// Envía el correo DESPUÉS de responder al cliente: la respuesta tarda lo mismo
// exista o no la cuenta (no permite averiguar emails por tiempo) y la app no
// espera al SMTP. Si falla, queda en el log.
function sendMailAfterResponse(string $to, string $subject, array $body): void {
    register_shutdown_function(function () use ($to, $subject, $body) {
        // Que cerrar la conexión con la app no aborte el envío.
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        }
        $mailer = Mailer::fromConfig();
        if ($mailer === null) {
            AppLog::error('mail', 'SMTP sin configurar (faltan SMTP_HOST/SMTP_USER/SMTP_PASS): no se envía', ['asunto' => $subject]);
            return;
        }
        try {
            $mailer->send($to, $subject, $body['text'], $body['html']);
            AppLog::info('mail', 'enviado', ['asunto' => $subject, 'para' => AppLog::maskEmail($to)]);
        } catch (Throwable $e) {
            AppLog::error('mail', 'fallo al enviar: ' . $e->getMessage(), ['asunto' => $subject, 'para' => AppLog::maskEmail($to)]);
        }
    });
}

// El nombre lo elige quien se registra y el correo sale con nuestro remitente
// hacia un email que puede no ser suyo: solo se usa la primera palabra, corta,
// y se descarta si parece un enlace, un dominio o un teléfono (anti-phishing).
function emailGreetingName(string $name): string {
    $clean = preg_replace('/[\p{C}\s]+/u', ' ', $name); // null si el UTF-8 es inválido
    $first = explode(' ', trim((string)$clean))[0];
    if ($first === '' || preg_match('~[0-9/@:\\\\<>]|www\.|\.[a-z]{2,}~i', $first)) return '';
    return function_exists('mb_substr') ? mb_substr($first, 0, 30, 'UTF-8') : substr($first, 0, 30);
}

// Plantilla común de los correos. Devuelve ['text' => ..., 'html' => ...].
function emailBody(string $name, string $intro, ?string $code, string $outro): array {
    $e = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $name = emailGreetingName($name);
    $greeting = $name !== '' ? "Hola, $name:" : 'Hola:';

    $text = $greeting . "\n\n" . $intro . "\n\n"
          . ($code !== null ? $code . "\n\n" : '')
          . $outro . "\n\n— ChillPocket";

    $codeHtml = $code === null ? '' :
        '<p style="margin:24px 0;text-align:center"><span style="display:inline-block;padding:14px 22px;'
        . 'border-radius:14px;background:#EEEDFD;color:#6C63F1;font-size:32px;font-weight:700;letter-spacing:8px;'
        . 'font-family:Menlo,Consolas,monospace">' . $e($code) . '</span></p>';

    $html = '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#F4F3FA;'
          . 'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F1D2B">'
          . '<div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:20px;padding:28px">'
          . '<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#6C63F1">ChillPocket</p>'
          . '<p style="margin:0 0 12px;font-size:16px">' . $e($greeting) . '</p>'
          . '<p style="margin:0;font-size:15px;line-height:1.5">' . $e($intro) . '</p>'
          . $codeHtml
          . '<p style="margin:0;font-size:13px;line-height:1.5;color:#6B6880">' . $e($outro) . '</p>'
          . '</div></body></html>';

    return ['text' => $text, 'html' => $html];
}

// Une los datos de billing al objeto user que se devuelve al cliente.
function attachEntitlement(PDO $conn, ?array $user): ?array {
    if (!$user || !isset($user['id'])) return $user;
    return array_merge($user, getUserEntitlements($conn, (int)$user['id']));
}

// Cuenta los recursos del usuario para una entidad concreta (para enforce de
// límites). Mantenemos las cuentas baratas (queries simples) — se llaman en
// los POST, así que el throughput es bajo.
function planCount(PDO $conn, int $userId, string $entity, ?string $month = null): int {
    switch ($entity) {
        case 'budgets':
            // Cuántos presupuestos tiene el usuario en el mes dado (o cualquier mes si no).
            if ($month !== null) {
                $stmt = $conn->prepare("SELECT COUNT(*) FROM budgets WHERE user_id = :u AND month_year = :m");
                $stmt->execute([':u' => $userId, ':m' => $month]);
            } else {
                $stmt = $conn->prepare("SELECT COUNT(DISTINCT category_id, month_year) FROM budgets WHERE user_id = :u");
                $stmt->execute([':u' => $userId]);
            }
            return (int)$stmt->fetchColumn();
        case 'goals':
            $stmt = $conn->prepare("SELECT COUNT(*) FROM savings_goals WHERE user_id = :u AND is_completed = 0");
            $stmt->execute([':u' => $userId]);
            return (int)$stmt->fetchColumn();
        case 'recurring':
            $stmt = $conn->prepare("SELECT COUNT(*) FROM recurring_expenses WHERE user_id = :u AND is_active = 1");
            $stmt->execute([':u' => $userId]);
            return (int)$stmt->fetchColumn();
        case 'custom_categories':
            $stmt = $conn->prepare("SELECT COUNT(*) FROM categories WHERE user_id = :u");
            $stmt->execute([':u' => $userId]);
            return (int)$stmt->fetchColumn();
        default:
            return 0;
    }
}

// Si el usuario supera el límite del plan para `entity`, devuelve la respuesta
// 403 lista para enviar; si está dentro del límite devuelve null. Pasar `month`
// solo para 'budgets' (los presupuestos se cuentan por mes).
function enforcePlanLimit(PDO $conn, int $userId, string $entity, ?string $month = null): ?array {
    $ent   = getUserEntitlements($conn, $userId);
    $limit = $ent['limits'][$entity] ?? null;
    if ($limit === null) return null; // ilimitado
    $current = planCount($conn, $userId, $entity, $month);
    if ($current >= (int)$limit) {
        return [
            'error'   => true,
            'code'    => 'plan_limit_reached',
            'message' => "Has alcanzado el límite de tu plan ({$current}/{$limit}).",
            'entity'  => $entity,
            'limit'   => (int)$limit,
            'current' => $current,
            'plan'    => $ent['plan_code'],
        ];
    }
    return null;
}

/**
 * Si el usuario tiene un límite de profundidad de historial (limits.history_months)
 * y la petición intenta acceder a un mes/fecha más antiguo de lo permitido,
 * devuelve respuesta 403 plan_limit_reached. Si está dentro del límite o el plan
 * es ilimitado, devuelve null.
 *
 * @param string|null $monthYear  Formato 'YYYY-MM' (de /analytics/all).
 * @param string|null $from       Formato 'YYYY-MM-DD' (de /transactions).
 */
function enforceHistoryLimit(PDO $conn, int $userId, ?string $monthYear = null, ?string $from = null): ?array {
    $ent    = getUserEntitlements($conn, $userId);
    $months = $ent['limits']['history_months'] ?? null;
    if ($months === null) return null;   // ilimitado
    $months = (int)$months;
    if ($months < 1) return null;         // valor inválido o 0 → no restringe

    // Mes mínimo permitido = primer día del mes hace ($months - 1) meses.
    // Ejemplo: hoy = 2026-05-27, months = 3 → permitido desde 2026-03-01.
    $oldestAllowed = (new DateTimeImmutable('first day of this month'))
        ->modify('-' . ($months - 1) . ' months')
        ->format('Y-m-d');

    $requestedDate = null;
    if ($monthYear !== null && preg_match('/^\d{4}-\d{2}$/', $monthYear)) {
        $requestedDate = $monthYear . '-01';
    } elseif ($from !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
        $requestedDate = $from;
    }

    if ($requestedDate !== null && $requestedDate < $oldestAllowed) {
        return [
            'error'          => true,
            'code'           => 'plan_limit_reached',
            'message'        => "Tu plan muestra los últimos {$months} meses. Plus desbloquea el historial completo.",
            'entity'         => 'history',
            'limit'          => $months,
            'oldest_allowed' => $oldestAllowed,
            'plan'           => $ent['plan_code'],
        ];
    }
    return null;
}

// =====================================================
// BILLING · RevenueCat webhook helpers
// =====================================================

/**
 * Mapea el product_id de RevenueCat al plan_code de ChillPocket.
 * Devuelve null si no reconoce el producto → el webhook lo trata como no-op.
 */
function rcProductToPlanCode(string $productId): ?string {
    if (preg_match('/^plus_/', $productId))          return 'plus';
    if ($productId === 'lifetime_plus')              return 'plus';
    if (preg_match('/^family_/', $productId))        return 'family';
    if (preg_match('/^pro_freelance_/', $productId)) return 'pro_freelance';
    return null;
}

// =====================================================
// GOOGLE OAUTH · verificación de ID token
// =====================================================
// Verificamos el ID token llamando al endpoint oficial de Google
// (tokeninfo): Google comprueba la firma por nosotros, así que esto
// NO depende de la versión de firebase/php-jwt ni de claves locales.
// Luego validamos issuer + audience + expiración.
//
// Devuelve ['ok'=>bool, 'reason'=>string, 'payload'=>array|null].

function httpGetRaw(string $url): ?string {
    // cURL preferido; fallback a file_get_contents si no hay cURL.
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $res = curl_exec($ch);
        // Sin curl_close(): no hace nada desde PHP 8.0 y en 8.5 avisa de obsoleto en el log.
        return $res === false ? null : $res;
    }
    // Mismo timeout y TLS verificado también sin cURL (por defecto serían 60 s).
    $ctx = stream_context_create([
        'http' => ['timeout' => 10, 'follow_location' => 0],
        'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $res = @file_get_contents($url, false, $ctx);
    return $res === false ? null : $res;
}

function verifyGoogleIdToken(string $idToken): array {
    $parts = explode('.', $idToken);
    if (count($parts) !== 3) {
        return ['ok'=>false, 'reason'=>'formato_token_invalido', 'payload'=>null];
    }

    $raw = httpGetRaw('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken));
    if ($raw === null) {
        return ['ok'=>false, 'reason'=>'sin_conexion_con_google', 'payload'=>null];
    }
    $payload = json_decode($raw, true);
    if (!is_array($payload) || isset($payload['error']) || isset($payload['error_description'])) {
        return ['ok'=>false, 'reason'=>'token_rechazado_por_google', 'payload'=>null];
    }

    $iss = $payload['iss'] ?? '';
    if (!in_array($iss, ['accounts.google.com', 'https://accounts.google.com'], true)) {
        return ['ok'=>false, 'reason'=>'issuer_invalido', 'payload'=>null];
    }
    $aud = (string)($payload['aud'] ?? '');
    if (!in_array($aud, GOOGLE_ALLOWED_CLIENT_IDS, true)) {
        // Pista clarísima de qué Client ID llega vs cuáles aceptamos.
        return ['ok'=>false, 'reason'=>'client_id_no_coincide (token aud='.$aud.')', 'payload'=>null];
    }
    if (isset($payload['exp']) && (int)$payload['exp'] < time()) {
        return ['ok'=>false, 'reason'=>'token_expirado', 'payload'=>null];
    }

    return ['ok'=>true, 'reason'=>'ok', 'payload'=>$payload];
}

// Devuelve el id de la categoría sistema "Ahorro" (user_id NULL). Si no
// existe la crea, así el front no necesita preocuparse.
function savingsCategoryId(PDO $conn, string $type = 'expense'): int {
    $type = $type === 'income' ? 'income' : 'expense';
    $stmt = $conn->prepare("
        SELECT id FROM categories
        WHERE user_id IS NULL AND name = 'Ahorro' AND type = :t
        LIMIT 1
    ");
    $stmt->execute([':t' => $type]);
    $id = $stmt->fetchColumn();
    if ($id) return (int)$id;
    $ins = $conn->prepare("
        INSERT INTO categories (user_id, name, color, icon, type)
        VALUES (NULL, 'Ahorro', '#10B981', 'savings', :t)
    ");
    $ins->execute([':t' => $type]);
    return (int)$conn->lastInsertId();
}

/**
 * Crea una transferencia entre "Saldo del mes" y "Mis ahorros": una fila
 * scope='month' (gasto hacia ahorro, ingreso desde ahorro) con `transfer` > 0.
 */
function insertSavingsTransfer(PDO $conn, int $userId, string $direction, float $amount, string $date, int $kind): int {
    $toSavings = $direction === 'to_savings';
    $conn->prepare("
        INSERT INTO transactions (user_id, category_id, amount, description, type, transaction_date, notes, scope, transfer)
        VALUES (:u, :c, :a, :d, :t, :td, :n, 'month', :k)
    ")->execute([
        ':u'  => $userId,
        ':c'  => savingsCategoryId($conn, $toSavings ? 'expense' : 'income'),
        ':a'  => $amount,
        ':d'  => $kind === 2 ? 'Ahorro automático' : ($toSavings ? 'Transferencia a Mis ahorros' : 'Retirada de Mis ahorros'),
        ':t'  => $toSavings ? 'expense' : 'income',
        ':td' => $date,
        ':n'  => $kind === 2 ? 'Transferencia mensual a Mis ahorros' : null,
        ':k'  => $kind,
    ]);
    return (int)$conn->lastInsertId();
}

/**
 * Ahorro automático: una vez por periodo pasa `savings_goal_monthly` de
 * "Saldo del mes" a "Mis ahorros", con fecha del inicio del periodo (día de cobro).
 * `auto_savings_period` evita repetirla, también si el usuario la borra.
 */
function applyAutoSavings(PDO $conn, int $userId): void {
    $st = $conn->prepare("SELECT savings_goal_monthly, auto_savings_period FROM users WHERE id = :u");
    $st->execute([':u' => $userId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $amount = round((float)($row['savings_goal_monthly'] ?? 0), 2);
    if (!$row || $amount <= 0) return;
    $periodStart = currentPeriodStart($conn, $userId);
    if ($row['auto_savings_period'] !== null && (string)$row['auto_savings_period'] >= $periodStart) return;
    // Marca primero y con condición: dos peticiones a la vez no la duplican.
    $mark = $conn->prepare("
        UPDATE users SET auto_savings_period = :ps
        WHERE id = :u AND (auto_savings_period IS NULL OR auto_savings_period < :ps2)
    ");
    $mark->execute([':ps' => $periodStart, ':ps2' => $periodStart, ':u' => $userId]);
    if ($mark->rowCount() === 0) return;
    insertSavingsTransfer($conn, $userId, 'to_savings', $amount, $periodStart, 2);
}

// =====================================================
// GENERADOR DE TRANSACCIONES DE GASTOS/INGRESOS FIJOS
// =====================================================
// Llamado de forma "lazy" en cada petición protegida.
// Para cada recurrente activo del usuario, genera transacciones
// para cada fecha que toque desde la última generada (o desde
// start_date) hasta hoy, respetando end_date.
// El UNIQUE (user_id, recurring_id, transaction_date) protege
// frente a duplicados aunque haya carreras.
function expandRecurringTransactions(PDO $conn, int $userId): void {
    $today = new DateTimeImmutable('today');

    $stmt = $conn->prepare("
        SELECT r.id, r.category_id, r.name, r.amount, r.type,
               r.frequency, r.start_date, r.end_date,
               GREATEST(
                   COALESCE(r.last_generated_date, '1000-01-01'),
                   COALESCE((SELECT MAX(t.transaction_date) FROM transactions t
                              WHERE t.recurring_id = r.id AND t.user_id = r.user_id), '1000-01-01')
               ) AS last_date
        FROM recurring_expenses r
        WHERE r.user_id = :u AND r.is_active = 1
    ");
    $stmt->execute([':u' => $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $ins = $conn->prepare("
        INSERT IGNORE INTO transactions
            (user_id, category_id, amount, description, type, transaction_date, notes, recurring_id)
        VALUES (:u, :c, :a, :d, :t, :td, :n, :rid)
    ");
    $mark = $conn->prepare("
        UPDATE recurring_expenses SET last_generated_date = :d
        WHERE id = :id AND user_id = :u AND (last_generated_date IS NULL OR last_generated_date < :d2)
    ");

    foreach ($rows as $r) {
        $start = DateTimeImmutable::createFromFormat('Y-m-d', (string)$r['start_date']);
        if (!$start) continue;
        $endLimit = $r['end_date']
            ? DateTimeImmutable::createFromFormat('Y-m-d', (string)$r['end_date'])
            : null;
        if ($endLimit && $endLimit < $today) continue;
        $upTo = $endLimit && $endLimit < $today ? $endLimit : $today;

        // Punto desde donde empezar a generar: día siguiente a la última fecha
        // generada (aunque el usuario la haya borrado), o start_date si nunca se generó nada.
        if ($r['last_date'] && $r['last_date'] !== '1000-01-01') {
            $cursor = DateTimeImmutable::createFromFormat('Y-m-d', (string)$r['last_date']);
            if (!$cursor) continue;
            $cursor = nextRecurringDate($cursor, $r['frequency'], $start);
        } else {
            $cursor = $start;
        }

        // Tope de seguridad por si alguien crea recurrentes con start_date muy antiguo.
        $maxIterations = 240; // 20 años de mensuales / 5 de semanales
        $i = 0;
        while ($cursor <= $upTo && $i < $maxIterations) {
            $ins->execute([
                ':u'   => $userId,
                ':c'   => $r['category_id'] !== null ? (int)$r['category_id'] : null,
                ':a'   => (float)$r['amount'],
                ':d'   => (string)$r['name'],
                ':t'   => (string)$r['type'],
                ':td'  => $cursor->format('Y-m-d'),
                ':n'   => 'Generado automáticamente desde gasto fijo',
                ':rid' => (int)$r['id'],
            ]);
            $generated = $cursor->format('Y-m-d');
            $cursor = nextRecurringDate($cursor, (string)$r['frequency'], $start);
            $i++;
        }
        if (isset($generated)) {
            $mark->execute([':d' => $generated, ':d2' => $generated, ':id' => (int)$r['id'], ':u' => $userId]);
            unset($generated);
        }
    }
}

function nextRecurringDate(DateTimeImmutable $from, string $frequency, DateTimeImmutable $anchor): DateTimeImmutable {
    return match ($frequency) {
        'weekly'  => $from->modify('+1 week'),
        'yearly'  => $from->modify('+1 year'),
        'monthly' => addMonthSafely($from, $anchor),
        default   => $from->modify('+1 month'),
    };
}

// Suma un mes preservando el día del anchor cuando el mes destino
// no tiene tantos días (p.ej. 31 ene + 1 mes -> 28/29 feb).
function addMonthSafely(DateTimeImmutable $from, DateTimeImmutable $anchor): DateTimeImmutable {
    $year  = (int)$from->format('Y');
    $month = (int)$from->format('n');
    $day   = (int)$anchor->format('j');
    $month++;
    if ($month > 12) { $month = 1; $year++; }
    $lastDay = (int)(new DateTimeImmutable("$year-$month-01"))->format('t');
    $day = min($day, $lastDay);
    return new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day));
}

// =====================================================
// MODELO DUAL · Helpers de periodo financiero (Fase 2)
// =====================================================

/**
 * Devuelve la fecha de inicio del periodo financiero actual del usuario
 * en formato 'YYYY-MM-DD'.
 *
 * Si el usuario tiene income_payday (1-31): el periodo va desde ese día del
 * mes pasado hasta el día payday-1 del mes actual (normalizando con LAST_DAY
 * cuando el mes no tiene ese día). Ejemplo: payday=25, hoy=2026-05-10 →
 * periodo_start = 2026-04-25.
 *
 * Si income_payday es NULL: el periodo empieza el día 1 del mes actual.
 *
 * El resultado se cachea en $_periodStartCache para evitar queries repetidas
 * dentro de la misma request.
 */
$_periodStartCache = [];
$_paydayCache = [];

/**
 * Devuelve el income_payday del usuario, cacheado en memoria por request.
 * Lo usan currentPeriodStart() y closeFinancialPeriods() para evitar
 * consultas duplicadas a `users` dentro de la misma request (cuota Hostinger).
 */
function getUserPayday(PDO $conn, int $userId): ?int {
    global $_paydayCache;
    if (array_key_exists($userId, $_paydayCache)) {
        return $_paydayCache[$userId];
    }
    $stmt = $conn->prepare("SELECT income_payday FROM users WHERE id = :u LIMIT 1");
    $stmt->execute([':u' => $userId]);
    $row    = $stmt->fetch(PDO::FETCH_ASSOC);
    $payday = $row && isset($row['income_payday']) && $row['income_payday'] !== null
              ? (int)$row['income_payday']
              : null;
    $_paydayCache[$userId] = $payday;
    return $payday;
}

function currentPeriodStart(PDO $conn, int $userId): string {
    global $_periodStartCache;
    if (isset($_periodStartCache[$userId])) {
        return $_periodStartCache[$userId];
    }

    $payday = getUserPayday($conn, $userId);

    $today = new DateTimeImmutable('today');

    if ($payday === null || $payday < 1 || $payday > 31) {
        // Sin payday configurado → periodo = mes natural, empieza el día 1.
        $result = $today->format('Y-m') . '-01';
    } else {
        // Calcular el inicio del periodo: payday del mes pasado (o del actual
        // si hoy es anterior al payday).
        $year  = (int)$today->format('Y');
        $month = (int)$today->format('n');
        $day   = (int)$today->format('j');

        // Calcular el payday normalizado del mes actual (por si el mes es corto).
        $lastDayThisMonth = (int)(new DateTimeImmutable("$year-$month-01"))->format('t');
        $paydayThisMonth  = min($payday, $lastDayThisMonth);

        if ($day >= $paydayThisMonth) {
            // El cobro de este mes ya pasó (o es hoy): el periodo empezó este mes.
            $result = sprintf('%04d-%02d-%02d', $year, $month, $paydayThisMonth);
        } else {
            // El cobro de este mes aún no ha llegado: el periodo empezó el mes pasado.
            $prevMonth = $month - 1;
            $prevYear  = $year;
            if ($prevMonth < 1) { $prevMonth = 12; $prevYear--; }
            $lastDayPrevMonth = (int)(new DateTimeImmutable("$prevYear-$prevMonth-01"))->format('t');
            $paydayPrevMonth  = min($payday, $lastDayPrevMonth);
            $result = sprintf('%04d-%02d-%02d', $prevYear, $prevMonth, $paydayPrevMonth);
        }
    }

    $_periodStartCache[$userId] = $result;
    return $result;
}

/**
 * Calcula el inicio del siguiente periodo desde un $periodStart dado,
 * respetando el payday del usuario.
 * Uso interno de closeFinancialPeriods().
 */
function nextPeriodStart(string $periodStart, ?int $payday): string {
    $dt    = new DateTimeImmutable($periodStart);
    $year  = (int)$dt->format('Y');
    $month = (int)$dt->format('n');

    $nextMonth = $month + 1;
    $nextYear  = $year;
    if ($nextMonth > 12) { $nextMonth = 1; $nextYear++; }

    if ($payday === null || $payday < 1 || $payday > 31) {
        // Mes natural: siguiente periodo = día 1 del mes siguiente.
        return sprintf('%04d-%02d-01', $nextYear, $nextMonth);
    }

    $lastDayNext = (int)(new DateTimeImmutable("$nextYear-$nextMonth-01"))->format('t');
    $paydayNext  = min($payday, $lastDayNext);
    return sprintf('%04d-%02d-%02d', $nextYear, $nextMonth, $paydayNext);
}

/**
 * Cierra los periodos financieros del usuario que ya hayan terminado y aún
 * no tengan entrada en monthly_closures.
 *
 * Patrón lazy idempotente: análogo a expandRecurringTransactions().
 * - Máximo 24 cierres por request (cap duro; protege cuota Hostinger).
 * - INSERT IGNORE garantiza idempotencia por el UNIQUE (user_id, period_start).
 * - Si el usuario no tiene transacciones, devuelve sin hacer nada.
 * - Los errores quedan en error_log; NO deben tumbar la request normal.
 */
function closeFinancialPeriods(PDO $conn, int $userId): void {
    // Reutiliza la cache compartida con currentPeriodStart() para no
    // duplicar la consulta a `users.income_payday` (cuota Hostinger).
    $payday = getUserPayday($conn, $userId);

    // Transacción más antigua: determina el primer periodo a cerrar.
    $stmt = $conn->prepare("SELECT MIN(transaction_date) AS oldest FROM transactions WHERE user_id = :u");
    $stmt->execute([':u' => $userId]);
    $oldestRow = $stmt->fetch(PDO::FETCH_ASSOC);
    $oldest = $oldestRow['oldest'] ?? null;
    if ($oldest === null) return; // Sin transacciones → nada que cerrar.

    // Inicio del periodo actual (no cerrar el mes en curso).
    $currentStart = currentPeriodStart($conn, $userId);

    // Último cierre ya registrado para este usuario.
    $lastStmt = $conn->prepare("SELECT MAX(period_start) AS last_start FROM monthly_closures WHERE user_id = :u");
    $lastStmt->execute([':u' => $userId]);
    $lastStart = $lastStmt->fetch(PDO::FETCH_ASSOC)['last_start'] ?? null;

    if (pendingPeriodStart($payday, $oldest, $lastStart) >= $currentStart) {
        return; // Caso habitual: no hay nada pendiente (sin bloqueos ni consultas extra).
    }

    // Hay cierres pendientes. Se hacen con la fila del usuario bloqueada y
    // confirmando que el día de cobro sigue siendo el leído: si PUT /me lo está
    // cambiando a la vez, cerrar con el anterior dejaría cierres solapados.
    $ownTx = !$conn->inTransaction();
    if ($ownTx) $conn->beginTransaction();
    try {
        $lock = $conn->prepare("SELECT income_payday FROM users WHERE id = :u FOR UPDATE");
        $lock->execute([':u' => $userId]);
        $locked = $lock->fetch(PDO::FETCH_ASSOC);
        $freshPayday = ($locked && $locked['income_payday'] !== null) ? (int)$locked['income_payday'] : null;
        if ($freshPayday !== $payday) {
            if ($ownTx) $conn->rollBack();
            return; // la siguiente petición cerrará con el valor nuevo
        }
        // Ya con el bloqueo, el último cierre puede haber cambiado.
        $lastStmt->execute([':u' => $userId]);
        $lastStart = $lastStmt->fetch(PDO::FETCH_ASSOC)['last_start'] ?? null;
        closePendingPeriods($conn, $userId, $payday, $oldest, $currentStart, $lastStart);
        if ($ownTx) $conn->commit();
    } catch (Throwable $e) {
        if ($ownTx && $conn->inTransaction()) $conn->rollBack();
        throw $e;
    }
}

/**
 * Inserta los cierres pendientes (máx. 24) desde el siguiente al último cerrado,
 * o desde el periodo de la transacción más antigua si no hay ninguno.
 * La llama closeFinancialPeriods() con la fila del usuario bloqueada.
 */
/**
 * Primer periodo sin cerrar: el siguiente al último cierre o, si no hay
 * ninguno, el periodo que contiene la transacción más antigua.
 */
function pendingPeriodStart(?int $payday, string $oldest, ?string $lastStart): string {
    if ($lastStart !== null) {
        // El siguiente periodo a cerrar es el consecutivo al último cerrado.
        return nextPeriodStart($lastStart, $payday);
    } else {
        // Nunca se han hecho cierres: empezamos desde el periodo de la tx más antigua.
        // Calcular el periodo_start que corresponde a $oldest según el payday.
        $oldestDt  = new DateTimeImmutable($oldest);
        $oYear     = (int)$oldestDt->format('Y');
        $oMonth    = (int)$oldestDt->format('n');
        $oDay      = (int)$oldestDt->format('j');

        if ($payday === null || $payday < 1 || $payday > 31) {
            return sprintf('%04d-%02d-01', $oYear, $oMonth);
        } else {
            $lastDayO   = (int)(new DateTimeImmutable("$oYear-$oMonth-01"))->format('t');
            $paydayO    = min($payday, $lastDayO);
            if ($oDay >= $paydayO) {
                // La tx cayó dentro del periodo que empieza en paydayO de ese mes.
                return sprintf('%04d-%02d-%02d', $oYear, $oMonth, $paydayO);
            } else {
                // La tx cayó antes del payday de ese mes → periodo del mes anterior.
                $pm = $oMonth - 1; $py = $oYear;
                if ($pm < 1) { $pm = 12; $py--; }
                $lastDayPM  = (int)(new DateTimeImmutable("$py-$pm-01"))->format('t');
                $paydayPM   = min($payday, $lastDayPM);
                return sprintf('%04d-%02d-%02d', $py, $pm, $paydayPM);
            }
        }
    }
}

function closePendingPeriods(PDO $conn, int $userId, ?int $payday, string $oldest, string $currentStart, ?string $lastStart): void {
    $nextStart = pendingPeriodStart($payday, $oldest, $lastStart);

    // Preparar statements reutilizables.
    $surplusStmt = $conn->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type='income'  AND scope='month' THEN amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type='expense' AND scope='month' THEN amount ELSE 0 END), 0) AS surplus
        FROM transactions
        WHERE user_id = :u
          AND transaction_date >= :ps
          AND transaction_date <= :pe
    ");
    $insertStmt = $conn->prepare("
        INSERT IGNORE INTO monthly_closures (user_id, period_start, period_end, surplus)
        VALUES (:u, :ps, :pe, :s)
    ");

    $iterations = 0;
    $maxIter    = 24; // cap duro

    while ($iterations < $maxIter) {
        // No cerrar el periodo actual ni futuros.
        if ($nextStart >= $currentStart) break;

        // period_end = día anterior al inicio del siguiente periodo.
        $periodEndDt = (new DateTimeImmutable(nextPeriodStart($nextStart, $payday)))->modify('-1 day');
        $periodEnd   = $periodEndDt->format('Y-m-d');

        // Calcular surplus del periodo.
        $surplusStmt->execute([':u' => $userId, ':ps' => $nextStart, ':pe' => $periodEnd]);
        $surplusRow = $surplusStmt->fetch(PDO::FETCH_ASSOC);
        $surplus    = (float)($surplusRow['surplus'] ?? 0);

        // Insertar cierre (INSERT IGNORE: si ya existe, no hace nada).
        $insertStmt->execute([
            ':u'  => $userId,
            ':ps' => $nextStart,
            ':pe' => $periodEnd,
            ':s'  => round($surplus, 2),
        ]);

        $nextStart = nextPeriodStart($nextStart, $payday);
        $iterations++;
    }
}

/**
 * Auto-renovación lazy de presupuestos (item 12 ROADMAP).
 * Si el usuario tiene presupuestos con auto_renew=1 en el mes anterior
 * y NO existen todavía en el mes solicitado, los clona.
 * Se llama desde GET /budgets antes de devolver datos; no requiere cron.
 *
 * AVISO category_id NULL: el UNIQUE uniq_user_cat_month trata NULL como
 * valor distinto en MySQL/MariaDB, por lo que INSERT IGNORE NO garantiza
 * idempotencia para el presupuesto global (sin categoría). Para ese caso
 * se usa un guard explícito antes de intentar la inserción.
 *
 * @param string $monthYear  Mes solicitado, formato 'YYYY-MM'.
 */
function autoRenewBudgets(PDO $conn, int $userId, string $monthYear): void {
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $monthYear . '-01');
    if (!$dt) return;
    $prevMonth = $dt->modify('-1 month')->format('Y-m');

    // Obtener los presupuestos del mes anterior con auto_renew=1.
    $src = $conn->prepare("
        SELECT category_id, amount, reset_day
        FROM budgets
        WHERE user_id = :u
          AND month_year = :prev
          AND auto_renew = 1
    ");
    $src->execute([':u' => $userId, ':prev' => $prevMonth]);
    $rows = $src->fetchAll(PDO::FETCH_ASSOC);
    if (empty($rows)) return;

    // Para cada fila origen, insertar en el mes nuevo solo si no existe ya.
    $ins = $conn->prepare("
        INSERT IGNORE INTO budgets (user_id, category_id, amount, month_year, reset_day, auto_renew)
        VALUES (:u, :c, :a, :m, :rd, 1)
    ");
    // Guard para el caso global (category_id NULL): INSERT IGNORE no garantiza
    // idempotencia con NULL en el UNIQUE, así que comprobamos la existencia antes.
    $chkGlobal = $conn->prepare("
        SELECT id FROM budgets
        WHERE user_id = :u AND month_year = :m AND category_id IS NULL
        LIMIT 1
    ");

    foreach ($rows as $row) {
        $catId = $row['category_id'] !== null ? (int)$row['category_id'] : null;

        if ($catId === null) {
            // Presupuesto global: guard explícito para evitar duplicado por NULL en UNIQUE.
            $chkGlobal->execute([':u' => $userId, ':m' => $monthYear]);
            if ($chkGlobal->fetch()) continue; // Ya existe, saltar.
        }

        $ins->execute([
            ':u'  => $userId,
            ':c'  => $catId,
            ':a'  => (float)$row['amount'],
            ':m'  => $monthYear,
            ':rd' => (int)$row['reset_day'],
        ]);
    }
}

// ================= MIDDLEWARE =================
function requireAuth(PDO $conn): callable {
    return function (Request $request, RequestHandlerInterface $handler) use ($conn) {
        $user = authenticate($request);
        if (!$user) {
            $response = new \Slim\Psr7\Response();
            return jsonResponse($response, ['error'=>true,'message'=>'Token inválido o no proporcionado'], 401);
        }
        AppLog::setUser((int)$user['user_id']);
        // El lote de estadísticas no toca datos financieros: se ahorra las tareas diferidas.
        if (str_ends_with($request->getUri()->getPath(), '/usage')) {
            return $handler->handle($request->withAttribute('user', $user));
        }
        // Expansión lazy: para cualquier petición autenticada generamos las
        // transacciones recurrentes que toquen. Es idempotente gracias al
        // INDEX UNIQUE (user_id, recurring_id, transaction_date).
        try { expandRecurringTransactions($conn, (int)$user['user_id']); } catch (Throwable $e) { /* silencioso */ }
        // Cierre lazy de periodos: registra en monthly_closures todos los meses
        // que ya han terminado. Cap de 24 por request; idempotente; silencioso.
        try { closeFinancialPeriods($conn, (int)$user['user_id']); } catch (Throwable $e) {
            error_log('[closeFinancialPeriods] ' . $e->getMessage());
        }
        // Después de los cierres: la transferencia lleva fecha del periodo en curso.
        try { applyAutoSavings($conn, (int)$user['user_id']); } catch (Throwable $e) {
            error_log('[applyAutoSavings] ' . $e->getMessage());
        }
        return $handler->handle($request->withAttribute('user', $user));
    };
}

// ================= DOCS =================
$app->get('/', function (Request $request, Response $response) {
    return jsonResponse($response, [
        'success' => true,
        'name'    => 'ChillPocket API · Gestión de gastos personales',
        'version' => '1.2.0',
        'endpoints' => [
            'POST /auth/register             {name,email,password,currency?}',
            'POST /auth/login                {email,password}',
            'POST /auth/google               {id_token}  (Google OAuth, devuelve nuestro JWT)',
            'GET  /me',
            'PUT  /me                        {name?,currency?,timezone?,theme?,avatar_url?}',
            'PUT  /me/password               {current_password,new_password}',
            'GET  /categories?type=',
            'POST /categories                 {name,type,color?,icon?}',
            'PUT  /categories/{id}',
            'DELETE /categories/{id}',
            'GET  /transactions?from=&to=&type=&category_id=&payment_method=&search=&limit=&offset=',
            'GET  /transactions/export?format=csv[&from=YYYY-MM-DD][&to=YYYY-MM-DD]  (Plus; descarga CSV)',
            'POST /transactions              {amount,description,type,transaction_date,category_id?,payment_method?,notes?,scope?}',
            'PUT  /transactions/{id}         (campos parciales; scope inmutable si goal_id≠null)',
            'DELETE /transactions/{id}',
            'GET  /recurring',
            'POST /recurring                 {name,amount,frequency,start_date,type?,category_id?,end_date?,notes?}',
            'PUT  /recurring/{id}',
            'PATCH /recurring/{id}/toggle',
            'POST  /recurring/{id}/toggle    (alias compat)',
            'POST  /recurring/run            Genera transacciones recurrentes pendientes',
            'DELETE /recurring/{id}',
            'GET  /savings-goals',
            'POST /savings-goals             {name,target_amount,target_date?,description?,color?}',
            'PUT  /savings-goals/{id}',
            'POST /savings-goals/{id}/contribute  {amount, scope?: month|historical}',
            'POST /savings/transfer             {amount, direction: to_savings|to_spending}',
            'DELETE /savings-goals/{id}',
            'GET  /budgets?month_year=YYYY-MM',
            'POST /budgets                   {amount,month_year,category_id?,reset_day?}',
            'PUT  /budgets/{id}              {amount?,reset_day?}',
            'DELETE /budgets/{id}',
            'GET  /analytics/summary?month_year=YYYY-MM',
            'GET  /analytics/monthly?months=6',
            'GET  /analytics/categories?month_year=YYYY-MM',
            'GET  /analytics/category-comparison?months=6',
            'GET  /analytics/payment-methods?month_year=YYYY-MM',
            'GET  /analytics/trends?days=30',
            'GET  /analytics/projection',
            'GET  /analytics/all?month_year=YYYY-MM&months=6&days=30   (combinado, 1 sola petición)',
            'POST /billing/webhook/revenuecat   (pública; Authorization: <secreto RC)',
        ]
    ]);
});

// ================= AUTH =================
$app->post('/auth/register', function (Request $request, Response $response) use ($conn) {
    $data = $request->getParsedBody() ?? [];
    $emailIn = isset($data['email']) ? trim((string)$data['email']) : '';

    // Rate limit: bloquea abusos antes de tocar nada más.
    if (!checkAuthRateLimit($conn, $request, 'register', $emailIn !== '' ? $emailIn : null)) {
        return rateLimitedResponse($response);
    }

    foreach (['name','email','password'] as $f) {
        if (empty($data[$f])) {
            recordAuthFailure($conn, $request, 'register', $emailIn !== '' ? $emailIn : null);
            return jsonResponse($response, ['error'=>true,'message'=>"Falta campo: $f"], 400);
        }
    }
    // isSafeAddress además rechaza lo que FILTER_VALIDATE_EMAIL deja pasar y
    // rompería el SMTP (comillas con saltos de línea escapados, [IP], etc.).
    if (!is_string($data['email']) || !Mailer::isSafeAddress($data['email'])) {
        recordAuthFailure($conn, $request, 'register', $emailIn);
        return jsonResponse($response, ['error'=>true,'message'=>'Email inválido'], 400);
    }
    if (strlen((string)$data['password']) < 6) {
        recordAuthFailure($conn, $request, 'register', $emailIn);
        return jsonResponse($response, ['error'=>true,'message'=>'La contraseña debe tener al menos 6 caracteres'], 400);
    }

    $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email");
    $stmt->execute([':email' => $data['email']]);
    if ($stmt->fetch()) {
        recordAuthFailure($conn, $request, 'register', $emailIn);
        return jsonResponse($response, ['error'=>true,'message'=>'Email ya registrado'], 409);
    }

    $currency = strtoupper(trim((string)($data['currency'] ?? 'EUR')));
    if (!preg_match('/^[A-Z]{3}$/', $currency)) $currency = 'EUR';
    $timezone = trim((string)($data['timezone'] ?? 'Europe/Madrid'));

    $hashed = password_hash((string)$data['password'], PASSWORD_DEFAULT);

    try {
        $conn->beginTransaction();

        $stmt = $conn->prepare("
            INSERT INTO users (name, email, password_hash, currency, timezone)
            VALUES (:n, :e, :h, :c, :tz)
        ");
        $stmt->execute([
            ':n'  => $data['name'],
            ':e'  => $data['email'],
            ':h'  => $hashed,
            ':c'  => $currency,
            ':tz' => $timezone
        ]);
        $userId = (int)$conn->lastInsertId();
        createBaseEntitlement($conn, $userId);

        $conn->commit();

        $user = fetchUser($conn, $userId);
        $user = attachEntitlement($conn, $user);

        // Éxito → limpia los intentos previos para no penalizar al usuario.
        clearAuthAttempts($conn, $request, 'register', $emailIn);
        AppLog::info('auth', 'registro', ['u' => $userId]);

        // Verificación de email no bloqueante: la cuenta ya funciona.
        try {
            $code = issueEmailCode($conn, $userId, 'verify_email', EMAIL_CODE_TTL_VERIFY);
            sendMailAfterResponse((string)$user['email'], 'Confirma tu email en ChillPocket', emailBody(
                (string)$user['name'],
                'Bienvenido a ChillPocket. Introduce este código en la app para confirmar tu email:',
                $code,
                'Caduca en ' . EMAIL_CODE_TTL_VERIFY . ' minutos. Si no has creado esta cuenta, ignora este correo.'
            ));
        } catch (Throwable $e) {
            error_log('[auth/register] código de verificación: ' . $e->getMessage());
        }

        return jsonResponse($response, [
            'success' => true,
            'token'   => tokenForUser($user),
            'user'    => $user
        ], 201);
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        error_log('[auth/register] ' . $e->getMessage());
        recordAuthFailure($conn, $request, 'register', $emailIn);
        return jsonResponse($response, ['error'=>true,'message'=>'No se pudo crear la cuenta'], 500);
    }
});

// =====================================================
// LOGIN CON GOOGLE
// =====================================================
// Recibe un id_token de Google, lo verifica contra las claves públicas
// y crea o reutiliza el usuario por email. Devuelve nuestro propio JWT.
$app->post('/auth/google', function (Request $request, Response $response) use ($conn) {
    $data = $request->getParsedBody() ?? [];
    $idToken = isset($data['id_token']) ? (string)$data['id_token'] : '';

    // Rate limit por IP antes de verificar el token (verificarlo cuesta una llamada a tokeninfo).
    if (!checkAuthRateLimit($conn, $request, 'google', null)) {
        return rateLimitedResponse($response);
    }

    if ($idToken === '') {
        recordAuthFailure($conn, $request, 'google', null);
        return jsonResponse($response, ['error'=>true,'message'=>'Falta id_token'], 400);
    }

    $check = verifyGoogleIdToken($idToken);
    if (!$check['ok']) {
        recordAuthFailure($conn, $request, 'google', null);
        return jsonResponse($response, ['error'=>true,'message'=>'Google: '.$check['reason']], 401);
    }
    $payload = $check['payload'];
    $email = trim((string)($payload['email'] ?? ''));
    $sub   = trim((string)($payload['sub']   ?? ''));
    if ($email === '' || $sub === '') {
        recordAuthFailure($conn, $request, 'google', null);
        return jsonResponse($response, ['error'=>true,'message'=>'Token sin email/sub'], 401);
    }
    // Exigir email verificado ANTES de enlazar/crear cuenta por email. Sin esto,
    // un id_token con un email no verificado podría enlazarse a una cuenta ajena
    // (toma de cuentas). Google entrega el flag como bool o string.
    $emailVerified = $payload['email_verified'] ?? false;
    if ($emailVerified !== true && $emailVerified !== 'true') {
        recordAuthFailure($conn, $request, 'google', $email);
        return jsonResponse($response, ['error'=>true,'message'=>'El email de Google no está verificado'], 401);
    }

    $name = trim((string)($payload['name'] ?? '')) ?: explode('@', $email)[0];
    $picture = isset($payload['picture']) ? (string)$payload['picture'] : null;

    $isNew = false;
    try {
        $conn->beginTransaction();

        // 1) ¿Existe usuario con ese google_sub?
        $stmt = $conn->prepare("SELECT id FROM users WHERE google_sub = :s LIMIT 1");
        $stmt->execute([':s'=>$sub]);
        $userId = $stmt->fetchColumn();

        // 2) Si no, busca por email para enlazar cuenta existente.
        if (!$userId) {
            $stmt = $conn->prepare("SELECT id, google_sub, email_verified_at FROM users WHERE email = :e LIMIT 1");
            $stmt->execute([':e'=>$email]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                // Si la cuenta ya está vinculada a OTRA cuenta de Google (sub distinto),
                // no se reenlaza: el `sub` es la identidad estable y un email puede
                // cambiar de dueño en Google (dominios caducados, cuentas recreadas).
                if (!empty($existing['google_sub']) && (string)$existing['google_sub'] !== $sub) {
                    $conn->rollBack();
                    recordAuthFailure($conn, $request, 'google', $email);
                    error_log('[auth/google] email ya vinculado a otro google_sub (user ' . (int)$existing['id'] . ')');
                    return jsonResponse($response, ['error'=>true,'message'=>'Este email ya está vinculado a otra cuenta de Google'], 409);
                }
                $userId = (int)$existing['id'];
                // Enlazamos el google_sub a la cuenta ya existente
                $upd = $conn->prepare("UPDATE users SET google_sub = :s WHERE id = :id AND google_sub IS NULL");
                $upd->execute([':s'=>$sub, ':id'=>$userId]);
                // Sin email verificado, la contraseña pudo ponerla otra persona que
                // registró este email antes que su dueño: deja de valer. El dueño
                // entra con Google o fija una nueva con "¿Olvidaste tu contraseña?".
                if (empty($existing['email_verified_at'])) {
                    $conn->prepare("UPDATE users SET password_hash = :h WHERE id = :id")
                         ->execute([':h' => password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT), ':id' => $userId]);
                    AppLog::warning('auth', 'google enlazado a cuenta sin verificar: contraseña invalidada', ['user' => $userId]);
                }
            }
        }

        // 3) Si tampoco, creamos un usuario nuevo. Password aleatoria no usable
        //    (el usuario entrará siempre por Google; si después quiere usar
        //    contraseña, puede hacerlo desde "Cambiar contraseña" → email reset).
        if (!$userId) {
            $randomPwd = bin2hex(random_bytes(32));
            $hash = password_hash($randomPwd, PASSWORD_DEFAULT);
            $ins = $conn->prepare("
                INSERT INTO users (name, email, password_hash, currency, timezone, avatar_url, google_sub)
                VALUES (:n, :e, :h, 'EUR', 'Europe/Madrid', :a, :s)
            ");
            $ins->execute([
                ':n'=>$name, ':e'=>$email, ':h'=>$hash, ':a'=>$picture, ':s'=>$sub,
            ]);
            $userId = (int)$conn->lastInsertId();
            $isNew = true; // usuario recién creado vía Google → activar onboarding
            createBaseEntitlement($conn, $userId);
        }

        $conn->commit();
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        recordAuthFailure($conn, $request, 'google', $email);
        return jsonResponse($response, ['error'=>true,'message'=>'No se pudo iniciar sesión con Google'], 500);
    }

    // Google ya ha verificado el email (se comprueba arriba).
    markEmailVerified($conn, (int)$userId);

    $user = fetchUser($conn, (int)$userId);
    if (!$user) {
        recordAuthFailure($conn, $request, 'google', $email);
        return jsonResponse($response, ['error'=>true,'message'=>'Usuario no encontrado'], 500);
    }

    // Aprovechamos para regenerar transacciones recurrentes pendientes
    try { expandRecurringTransactions($conn, (int)$user['id']); } catch (Throwable $e) {}

    $user = attachEntitlement($conn, $user);

    // Éxito → limpia contadores para esa IP y email.
    clearAuthAttempts($conn, $request, 'google', $email);
    AppLog::info('auth', $isNew ? 'registro con Google' : 'login con Google', ['u' => (int)$user['id']]);

    return jsonResponse($response, [
        'success' => true,
        'token'   => tokenForUser($user),
        'user'    => $user,
        'is_new'  => $isNew,
    ]);
});

$app->post('/auth/login', function (Request $request, Response $response) use ($conn) {
    $data    = $request->getParsedBody() ?? [];
    $emailIn = isset($data['email']) ? trim((string)$data['email']) : '';

    // Rate limit: bloquea brute-force antes de procesar la contraseña.
    if (!checkAuthRateLimit($conn, $request, 'login', $emailIn !== '' ? $emailIn : null)) {
        return rateLimitedResponse($response);
    }

    if ($emailIn === '' || empty($data['password'])) {
        recordAuthFailure($conn, $request, 'login', $emailIn !== '' ? $emailIn : null);
        return jsonResponse($response, ['error'=>true,'message'=>'Email y password son obligatorios'], 400);
    }
    $stmt = $conn->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $emailIn]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !password_verify((string)$data['password'], (string)$row['password_hash'])) {
        recordAuthFailure($conn, $request, 'login', $emailIn);
        return jsonResponse($response, ['error'=>true,'message'=>'Credenciales inválidas'], 401);
    }

    $user = fetchUser($conn, (int)$row['id']);
    // Generar transacciones pendientes inmediatamente al iniciar sesión
    try { expandRecurringTransactions($conn, (int)$user['id']); } catch (Throwable $e) {}

    $user = attachEntitlement($conn, $user);

    // Éxito → reset del contador para esa IP+email.
    clearAuthAttempts($conn, $request, 'login', $emailIn);
    AppLog::info('auth', 'login correcto', ['u' => (int)$user['id']]);

    return jsonResponse($response, [
        'success' => true,
        'token'   => tokenForUser($user),
        'user'    => $user
    ]);
});

// =====================================================
// RECUPERAR CONTRASEÑA (público)
// =====================================================
// 1) /forgot envía un código de 6 dígitos al email. Responde siempre lo mismo,
//    exista o no la cuenta, para no revelar qué emails están registrados.
$app->post('/auth/password/forgot', function (Request $request, Response $response) use ($conn) {
    $data  = $request->getParsedBody() ?? [];
    $email = strtolower(trim((string)($data['email'] ?? '')));

    if (!Mailer::isSafeAddress($email)) {
        return jsonResponse($response, ['error'=>true,'message'=>'Email inválido'], 400);
    }
    if (!checkAuthRateLimit($conn, $request, 'pwd_forgot', $email, 3, 15)
        || !checkEmailDailyLimit($conn, 'pwd_forgot', $email, EMAIL_SENDS_PER_DAY)) {
        return rateLimitedResponse($response);
    }
    // Cada solicitud cuenta, no solo los fallos: limita el envío de correos.
    recordAuthFailure($conn, $request, 'pwd_forgot', $email);

    try {
        $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE email = :e LIMIT 1");
        $stmt->execute([':e' => $email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $code = issueEmailCode($conn, (int)$row['id'], 'reset_password', EMAIL_CODE_TTL_RESET);
            sendMailAfterResponse((string)$row['email'], 'Tu código para cambiar la contraseña', emailBody(
                (string)$row['name'],
                'Has pedido cambiar la contraseña de ChillPocket. Introduce este código en la app:',
                $code,
                'Caduca en ' . EMAIL_CODE_TTL_RESET . ' minutos. Si no has sido tú, ignora este correo: tu contraseña no cambiará.'
            ));
        }
    } catch (Throwable $e) {
        error_log('[auth/password/forgot] ' . $e->getMessage());
    }

    return jsonResponse($response, [
        'success' => true,
        'message' => 'Si el email está registrado, recibirás un código en unos minutos.',
    ]);
});

// 2) /reset valida el código, fija la nueva contraseña e inicia sesión.
$app->post('/auth/password/reset', function (Request $request, Response $response) use ($conn) {
    $data     = $request->getParsedBody() ?? [];
    $email    = strtolower(trim((string)($data['email'] ?? '')));
    $code     = trim((string)($data['code'] ?? ''));
    $password = (string)($data['new_password'] ?? '');

    if (!checkAuthRateLimit($conn, $request, 'pwd_reset', $email !== '' ? $email : null)
        || !checkEmailDailyLimit($conn, 'pwd_reset', $email, EMAIL_CODE_FAILS_PER_DAY)) {
        return rateLimitedResponse($response);
    }
    if (!Mailer::isSafeAddress($email) || $code === '') {
        return jsonResponse($response, ['error'=>true,'message'=>'Faltan el email o el código'], 400);
    }
    if (strlen($password) < 6) {
        return jsonResponse($response, ['error'=>true,'message'=>'La contraseña debe tener al menos 6 caracteres'], 400);
    }

    $invalid = ['error'=>true,'message'=>'El código no es correcto o ha caducado'];
    try {
        $stmt = $conn->prepare("SELECT id, name, email FROM users WHERE email = :e LIMIT 1");
        $stmt->execute([':e' => $email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !consumeEmailCode($conn, (int)$row['id'], 'reset_password', $code)) {
            recordAuthFailure($conn, $request, 'pwd_reset', $email);
            return jsonResponse($response, $invalid, 400);
        }
        $userId = (int)$row['id'];

        // Recibir el código demuestra que el email es suyo: queda verificado.
        $conn->prepare("
            UPDATE users
            SET password_hash = :h, email_verified_at = COALESCE(email_verified_at, NOW())
            WHERE id = :id
        ")->execute([':h' => password_hash($password, PASSWORD_DEFAULT), ':id' => $userId]);

        clearAuthAttempts($conn, $request, 'pwd_reset', $email);
        clearAuthAttempts($conn, $request, 'login', $email);
        AppLog::info('auth', 'contraseña restablecida con código', ['u' => $userId]);

        sendMailAfterResponse((string)$row['email'], 'Tu contraseña se ha cambiado', emailBody(
            (string)$row['name'],
            'La contraseña de tu cuenta de ChillPocket se acaba de cambiar.',
            null,
            'Si no has sido tú, recupera el acceso desde "¿Olvidaste tu contraseña?" y escríbenos.'
        ));

        $user = attachEntitlement($conn, fetchUser($conn, $userId));
        return jsonResponse($response, [
            'success' => true,
            'token'   => tokenForUser($user),
            'user'    => $user,
        ]);
    } catch (Throwable $e) {
        error_log('[auth/password/reset] ' . $e->getMessage());
        return jsonResponse($response, ['error'=>true,'message'=>'No se pudo cambiar la contraseña'], 500);
    }
});

// ================= PROTECTED =================
$app->group('', function (RouteCollectorProxy $group) use ($conn) {

    // ------ ME ------
    $group->get('/me', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $user = fetchUser($conn, (int)$jwt['user_id']);
        if (!$user) return jsonResponse($response, ['error'=>true,'message'=>'Usuario no existe'], 404);
        $user = attachEntitlement($conn, $user);
        return jsonResponse($response, ['user' => $user]);
    });

    $group->put('/me', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $data = $request->getParsedBody() ?? [];
        $fields = []; $params = [':id' => (int)$jwt['user_id']];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre vacío'], 400);
            $fields[] = 'name = :name'; $params[':name'] = $name;
        }
        if (array_key_exists('currency', $data)) {
            $cur = strtoupper(trim((string)$data['currency']));
            if (!preg_match('/^[A-Z]{3}$/', $cur)) return jsonResponse($response, ['error'=>true,'message'=>'Moneda inválida'], 400);
            $me = fetchUser($conn, (int)$jwt['user_id']);
            // Solo se puede pasar a una moneda soportada (reenviar la actual, aunque sea antigua, vale).
            if ($me && strtoupper((string)$me['currency']) !== $cur && !in_array($cur, SUPPORTED_CURRENCIES, true)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Moneda no soportada'], 400);
            }
            if ($me && strtoupper((string)$me['currency']) !== $cur && userHasMoneyData($conn, (int)$jwt['user_id'])) {
                return jsonResponse($response, [
                    'error'   => true,
                    'code'    => 'currency_conversion_required',
                    'message' => 'Para cambiar la moneda con datos guardados hay que convertirlos (Ajustes → Moneda).',
                ], 409);
            }
            $fields[] = 'currency = :currency'; $params[':currency'] = $cur;
        }
        if (array_key_exists('timezone', $data)) {
            $fields[] = 'timezone = :timezone'; $params[':timezone'] = trim((string)$data['timezone']);
        }
        if (array_key_exists('theme', $data)) {
            $theme = (string)$data['theme'];
            if (!in_array($theme, ['light','dark','system'], true)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Tema inválido'], 400);
            }
            $fields[] = 'theme = :theme'; $params[':theme'] = $theme;
        }
        if (array_key_exists('avatar_url', $data)) {
            $fields[] = 'avatar_url = :avatar_url'; $params[':avatar_url'] = $data['avatar_url'] ?: null;
        }

        // Perfil financiero (modelo dual). null = sin dato.
        $uid = (int)$jwt['user_id'];
        $hasPayday = false;
        $newPayday = null;
        if (array_key_exists('income_payday', $data)) {
            $raw = $data['income_payday'];
            $payday = null;
            if ($raw !== null && $raw !== '') {
                if (!is_numeric($raw) || (float)$raw != (int)$raw || (int)$raw < 1 || (int)$raw > 31) {
                    return jsonResponse($response, ['error'=>true,'message'=>'Día de cobro inválido'], 400);
                }
                $payday = (int)$raw;
            }
            $fields[] = 'income_payday = :income_payday'; $params[':income_payday'] = $payday;
            $hasPayday = true;
            $newPayday = $payday;
        }
        foreach (['income_reference' => 'El ingreso', 'savings_goal_monthly' => 'El objetivo de ahorro'] as $col => $label) {
            if (!array_key_exists($col, $data)) continue;
            $raw = $data[$col];
            $value = null;
            if ($raw !== null && $raw !== '') {
                if (!is_numeric($raw)) {
                    return jsonResponse($response, ['error'=>true,'message'=>"$label no es válido"], 400);
                }
                $value = round((float)$raw, 2);
                if ($value < 0 || $value > 99999999) {
                    return jsonResponse($response, ['error'=>true,'message'=>"$label está fuera de rango"], 400);
                }
            }
            // $col sale de la lista fija de arriba, nunca del cliente.
            $fields[] = "$col = :$col"; $params[":$col"] = $value;
        }

        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);

        // Todo en una transacción con la fila del usuario bloqueada: una petición
        // simultánea que esté cerrando periodos con el día de cobro anterior
        // espera o se retira (ver closeFinancialPeriods), así no quedan cierres solapados.
        try {
            $conn->beginTransaction();
            $lock = $conn->prepare("SELECT income_payday FROM users WHERE id = :u FOR UPDATE");
            $lock->execute([':u' => $uid]);
            $locked = $lock->fetch(PDO::FETCH_ASSOC);
            $currentPayday = ($locked && $locked['income_payday'] !== null) ? (int)$locked['income_payday'] : null;

            $stmt = $conn->prepare("UPDATE users SET ".implode(', ', $fields)." WHERE id = :id");
            $stmt->execute($params);

            if ($hasPayday && $currentPayday !== $newPayday) {
                // Los cierres se calcularon con el día de cobro anterior: con el nuevo
                // se solaparían o dejarían huecos. Son datos derivados de las
                // transacciones, así que se borran y se recalculan (24 por petición;
                // las siguientes peticiones completan el resto).
                global $_paydayCache, $_periodStartCache;
                $_paydayCache[$uid] = $newPayday;
                unset($_periodStartCache[$uid]);
                $conn->prepare("DELETE FROM monthly_closures WHERE user_id = :u")->execute([':u' => $uid]);
                closeFinancialPeriods($conn, $uid);
                // El ahorro automático de este mes ya se hizo: el periodo nuevo no lo repite.
                $conn->prepare("
                    UPDATE users SET auto_savings_period = GREATEST(auto_savings_period, :ps)
                    WHERE id = :u AND auto_savings_period IS NOT NULL
                ")->execute([':ps' => currentPeriodStart($conn, $uid), ':u' => $uid]);
            }
            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            error_log('[me] ' . $e->getMessage());
            return jsonResponse($response, ['error'=>true,'message'=>'No se pudo guardar el perfil'], 500);
        }

        return jsonResponse($response, ['success'=>true, 'user' => attachEntitlement($conn, fetchUser($conn, $uid))]);
    });

    // ------ VERIFICACIÓN DE EMAIL (no bloqueante; necesaria para mejorar de plan) ------
    $group->post('/me/email/send-verification', function (Request $request, Response $response) use ($conn) {
        $uid  = (int)$request->getAttribute('user')['user_id'];
        $stmt = $conn->prepare("SELECT name, email, email_verified_at FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $uid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return jsonResponse($response, ['error'=>true,'message'=>'Usuario no existe'], 404);
        if (!empty($row['email_verified_at'])) {
            return jsonResponse($response, ['success'=>true, 'already_verified'=>true]);
        }

        $email = strtolower((string)$row['email']);
        if (!checkAuthRateLimit($conn, $request, 'verify_send', $email, 3, 15)
            || !checkEmailDailyLimit($conn, 'verify_send', $email, EMAIL_SENDS_PER_DAY)) {
            return rateLimitedResponse($response);
        }
        recordAuthFailure($conn, $request, 'verify_send', $email);

        $code = issueEmailCode($conn, $uid, 'verify_email', EMAIL_CODE_TTL_VERIFY);
        sendMailAfterResponse((string)$row['email'], 'Confirma tu email en ChillPocket', emailBody(
            (string)$row['name'],
            'Introduce este código en la app para confirmar tu email:',
            $code,
            'Caduca en ' . EMAIL_CODE_TTL_VERIFY . ' minutos. Si no lo has pedido tú, ignora este correo.'
        ));
        return jsonResponse($response, ['success'=>true]);
    });

    $group->post('/me/email/verify', function (Request $request, Response $response) use ($conn) {
        $uid  = (int)$request->getAttribute('user')['user_id'];
        $data = $request->getParsedBody() ?? [];
        $code = trim((string)($data['code'] ?? ''));

        $stmt = $conn->prepare("SELECT email, email_verified_at FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $uid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return jsonResponse($response, ['error'=>true,'message'=>'Usuario no existe'], 404);
        $email = strtolower((string)$row['email']);

        if (empty($row['email_verified_at'])) {
            if (!checkAuthRateLimit($conn, $request, 'verify', $email)
                || !checkEmailDailyLimit($conn, 'verify', $email, EMAIL_CODE_FAILS_PER_DAY)) {
                return rateLimitedResponse($response);
            }
            if (!consumeEmailCode($conn, $uid, 'verify_email', $code)) {
                recordAuthFailure($conn, $request, 'verify', $email);
                return jsonResponse($response, ['error'=>true,'message'=>'El código no es correcto o ha caducado'], 400);
            }
            markEmailVerified($conn, $uid);
            clearAuthAttempts($conn, $request, 'verify', $email);
        }

        return jsonResponse($response, ['success'=>true, 'user' => attachEntitlement($conn, fetchUser($conn, $uid))]);
    });

    $group->put('/me/password', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $data = $request->getParsedBody() ?? [];
        if (empty($data['current_password']) || empty($data['new_password'])) {
            return jsonResponse($response, ['error'=>true,'message'=>'Contraseñas requeridas'], 400);
        }
        if (strlen((string)$data['new_password']) < 6) {
            return jsonResponse($response, ['error'=>true,'message'=>'La nueva contraseña debe tener al menos 6 caracteres'], 400);
        }
        $stmt = $conn->prepare("SELECT name, email, password_hash FROM users WHERE id = :id");
        $stmt->execute([':id' => (int)$jwt['user_id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !password_verify((string)$data['current_password'], (string)$row['password_hash'])) {
            return jsonResponse($response, ['error'=>true,'message'=>'Contraseña actual incorrecta'], 401);
        }
        $upd = $conn->prepare("UPDATE users SET password_hash = :h WHERE id = :id");
        $upd->execute([
            ':h'  => password_hash((string)$data['new_password'], PASSWORD_DEFAULT),
            ':id' => (int)$jwt['user_id']
        ]);
        sendMailAfterResponse((string)$row['email'], 'Tu contraseña se ha cambiado', emailBody(
            (string)$row['name'],
            'La contraseña de tu cuenta de ChillPocket se acaba de cambiar desde la app.',
            null,
            'Si no has sido tú, recupera el acceso desde "¿Olvidaste tu contraseña?" y escríbenos.'
        ));
        return jsonResponse($response, ['success'=>true]);
    });

    // ------ CATEGORIES ------
    $group->get('/categories', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $type = $request->getQueryParams()['type'] ?? null;
        $sql  = "
            SELECT id, name, color, icon, type, created_at,
                   (user_id IS NULL) AS is_system
            FROM categories
            WHERE (user_id = :u OR user_id IS NULL)
        ";
        $params = [':u' => (int)$jwt['user_id']];
        if ($type && in_array($type, ['expense','income'], true)) {
            $sql .= " AND type = :t"; $params[':t'] = $type;
        }
        $sql .= " ORDER BY type, is_system DESC, name";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) { $r['is_system'] = (bool)(int)$r['is_system']; }
        return jsonResponse($response, ['categories' => $rows]);
    });

    $group->post('/categories', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $data = $request->getParsedBody() ?? [];
        $name = trim((string)($data['name'] ?? ''));
        $type = (string)($data['type'] ?? 'expense');
        if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre obligatorio'], 400);
        if (!in_array($type, ['expense','income'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
        }
        if ($err = enforcePlanLimit($conn, $uid, 'custom_categories')) {
            return jsonResponse($response, $err, 403);
        }
        $dup = $conn->prepare("
            SELECT id FROM categories
            WHERE name = :n AND type = :t AND (user_id = :u OR user_id IS NULL)
            LIMIT 1
        ");
        $dup->execute([':n'=>$name, ':t'=>$type, ':u'=>$uid]);
        if ($dup->fetch()) {
            return jsonResponse($response, ['error'=>true,'message'=>'Ya existe una categoría con ese nombre'], 409);
        }

        $color = validHexColor($data['color'] ?? null);
        $icon  = isset($data['icon']) ? trim((string)$data['icon']) : null;
        $stmt = $conn->prepare("
            INSERT INTO categories (user_id, name, color, icon, type)
            VALUES (:u, :n, :c, :i, :t)
        ");
        $stmt->execute([
            ':u'=>$uid, ':n'=>$name, ':c'=>$color,
            ':i'=>$icon ?: null, ':t'=>$type
        ]);
        $id = (int)$conn->lastInsertId();
        $sel = $conn->prepare("
            SELECT id,name,color,icon,type,created_at,
                   (user_id IS NULL) AS is_system
            FROM categories WHERE id = :id
        ");
        $sel->execute([':id'=>$id]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        $row['is_system'] = (bool)(int)$row['is_system'];
        return jsonResponse($response, ['success'=>true,'category'=>$row], 201);
    });

    $group->put('/categories/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $id  = (int)$args['id'];

        if (!userOwnsCategory($conn, $uid, $id)) {
            $g = $conn->prepare("SELECT id FROM categories WHERE id = :id AND user_id IS NULL");
            $g->execute([':id'=>$id]);
            if ($g->fetch()) {
                return jsonResponse($response, ['error'=>true,'message'=>'Las categorías del sistema no se pueden editar'], 403);
            }
            return jsonResponse($response, ['error'=>true,'message'=>'Categoría no encontrada'], 404);
        }

        $data = $request->getParsedBody() ?? [];
        $fields = []; $params = [':id'=>$id];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre vacío'], 400);
            $dup = $conn->prepare("
                SELECT id FROM categories
                WHERE name = :n AND type = COALESCE(:t, type)
                  AND (user_id = :u OR user_id IS NULL)
                  AND id <> :id
                LIMIT 1
            ");
            $dup->execute([
                ':n'=>$name,
                ':t'=>$data['type'] ?? null,
                ':u'=>$uid,
                ':id'=>$id,
            ]);
            if ($dup->fetch()) {
                return jsonResponse($response, ['error'=>true,'message'=>'Ya existe otra categoría con ese nombre'], 409);
            }
            $fields[] = 'name = :name'; $params[':name'] = $name;
        }
        if (array_key_exists('color', $data)) {
            $fields[] = 'color = :color'; $params[':color'] = validHexColor($data['color']);
        }
        if (array_key_exists('icon', $data)) {
            $fields[] = 'icon = :icon'; $params[':icon'] = $data['icon'] ?: null;
        }
        if (array_key_exists('type', $data)) {
            if (!in_array($data['type'], ['expense','income'], true)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
            }
            $fields[] = 'type = :type'; $params[':type'] = $data['type'];
        }
        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);

        $stmt = $conn->prepare("UPDATE categories SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);
        return jsonResponse($response, ['success'=>true]);
    });

    $group->delete('/categories/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $id  = (int)$args['id'];

        if (!userOwnsCategory($conn, $uid, $id)) {
            $g = $conn->prepare("SELECT id FROM categories WHERE id = :id AND user_id IS NULL");
            $g->execute([':id'=>$id]);
            if ($g->fetch()) {
                return jsonResponse($response, ['error'=>true,'message'=>'Las categorías del sistema no se pueden eliminar'], 403);
            }
            return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        }

        $count = $conn->prepare("SELECT COUNT(*) AS n FROM transactions WHERE category_id = :id AND user_id = :u");
        $count->execute([':id'=>$id, ':u'=>$uid]);
        $n = (int)($count->fetch(PDO::FETCH_ASSOC)['n'] ?? 0);
        if ($n > 0) {
            return jsonResponse($response, [
                'error'=>true,
                'message'=>"No se puede eliminar: hay $n transacciones asociadas. Reasigna o borra primero."
            ], 409);
        }

        $stmt = $conn->prepare("DELETE FROM categories WHERE id = :id AND user_id = :u");
        $stmt->execute([':id'=>$id, ':u'=>$uid]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
    });

    // ------ TRANSACTIONS ------
    $group->get('/transactions', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $q   = $request->getQueryParams();

        // Gating de historial: usuarios free solo pueden consultar los últimos
        // limits.history_months meses. Si $from es anterior al límite → 403.
        $fromParam = !empty($q['from']) ? $q['from'] : null;
        if ($err = enforceHistoryLimit($conn, $uid, null, $fromParam)) {
            return jsonResponse($response, $err, 403);
        }

        $sql = "
            SELECT t.id, t.amount, t.description, t.type, t.transaction_date, t.notes,
                   t.payment_method, t.recurring_id, t.goal_id, t.scope, t.transfer,
                   t.category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   t.created_at, t.updated_at
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = :u
        ";
        $params = [':u' => (int)$jwt['user_id']];

        if (!empty($q['from']) && validDate($q['from'])) {
            $sql .= " AND t.transaction_date >= :from"; $params[':from'] = $q['from'];
        }
        if (!empty($q['to']) && validDate($q['to'])) {
            $sql .= " AND t.transaction_date <= :to"; $params[':to'] = $q['to'];
        }
        if (!empty($q['type']) && in_array($q['type'], ['expense','income'], true)) {
            $sql .= " AND t.type = :type"; $params[':type'] = $q['type'];
        }
        if (!empty($q['category_id'])) {
            $sql .= " AND t.category_id = :cat"; $params[':cat'] = (int)$q['category_id'];
        }
        if (!empty($q['payment_method']) && validPaymentMethod($q['payment_method'])) {
            $sql .= " AND t.payment_method = :pm"; $params[':pm'] = $q['payment_method'];
        }
        if (isset($q['amount_min']) && $q['amount_min'] !== '' && is_numeric($q['amount_min'])) {
            $min = (float)$q['amount_min'];
            if (is_finite($min) && $min >= 0) {
                $sql .= " AND t.amount >= :amin"; $params[':amin'] = $min;
            }
        }
        if (isset($q['amount_max']) && $q['amount_max'] !== '' && is_numeric($q['amount_max'])) {
            $max = (float)$q['amount_max'];
            if (is_finite($max) && $max >= 0) {
                $sql .= " AND t.amount <= :amax"; $params[':amax'] = $max;
            }
        }
        if (!empty($q['search'])) {
            $sql .= " AND (t.description LIKE :s OR t.notes LIKE :s)";
            $params[':s'] = '%'.$q['search'].'%';
        }

        $sql .= " ORDER BY t.transaction_date DESC, t.id DESC";

        $limit  = isset($q['limit'])  ? max(1, min(500, (int)$q['limit']))  : 100;
        $offset = isset($q['offset']) ? max(0, (int)$q['offset']) : 0;
        $sql .= " LIMIT $limit OFFSET $offset";

        $stmt = $conn->prepare($sql);
        $stmt->execute($params);

        return jsonResponse($response, [
            'transactions' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'limit'  => $limit,
            'offset' => $offset
        ]);
    });

    $group->post('/transactions', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $data = $request->getParsedBody() ?? [];

        $description = trim((string)($data['description'] ?? ''));
        $amount      = isset($data['amount']) ? (float)$data['amount'] : -1;
        $type        = (string)($data['type'] ?? 'expense');
        $date        = trim((string)($data['transaction_date'] ?? ''));
        $categoryId  = isset($data['category_id']) && $data['category_id'] !== '' ? (int)$data['category_id'] : null;
        $notes       = isset($data['notes']) ? trim((string)$data['notes']) : null;
        $paymentMethod = isset($data['payment_method']) && $data['payment_method'] !== '' ? (string)$data['payment_method'] : null;
        // Fase 4: scope opcional ('month' default | 'historical'). Determina si la
        // transacción afecta al saldo del mes o directamente a "Mis ahorros".
        $scope       = isset($data['scope']) && $data['scope'] !== '' ? (string)$data['scope'] : 'month';

        if ($description === '') return jsonResponse($response, ['error'=>true,'message'=>'Descripción obligatoria'], 400);
        if (!is_finite($amount) || $amount <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        if (!in_array($type, ['expense','income'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
        }
        if (!validDate($date)) return jsonResponse($response, ['error'=>true,'message'=>'Fecha inválida (YYYY-MM-DD)'], 400);
        if (!validPaymentMethod($paymentMethod)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo de pago inválido'], 400);
        }
        if (!validScope($scope)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Scope inválido'], 400);
        }
        // A "Mis ahorros" solo se llega con una transferencia desde el saldo del mes.
        if ($scope === 'historical') {
            return jsonResponse($response, ['error'=>true,'message'=>'Los movimientos van al saldo del mes. Para ahorrar, usa una transferencia.'], 400);
        }

        if ($categoryId !== null) {
            if (!userCanUseCategory($conn, (int)$jwt['user_id'], $categoryId)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
            }
        }

        $stmt = $conn->prepare("
            INSERT INTO transactions (user_id, category_id, amount, description, type, transaction_date, notes, payment_method, scope)
            VALUES (:u, :c, :a, :d, :t, :td, :n, :pm, :sc)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$categoryId, ':a'=>$amount,
            ':d'=>$description, ':t'=>$type, ':td'=>$date, ':n'=>$notes ?: null,
            ':pm'=>$paymentMethod ?: null, ':sc'=>$scope,
        ]);
        $id = (int)$conn->lastInsertId();

        $sel = $conn->prepare("
            SELECT t.id, t.amount, t.description, t.type, t.transaction_date, t.notes,
                   t.payment_method, t.recurring_id, t.goal_id, t.scope, t.transfer,
                   t.category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   t.created_at, t.updated_at
            FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = :id
        ");
        $sel->execute([':id'=>$id]);
        return jsonResponse($response, [
            'success'     => true,
            'transaction' => $sel->fetch(PDO::FETCH_ASSOC)
        ], 201);
    });

    $group->put('/transactions/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $id  = (int)$args['id'];
        $check = $conn->prepare("SELECT id, transfer FROM transactions WHERE id = :id AND user_id = :u");
        $check->execute([':id'=>$id, ':u'=>(int)$jwt['user_id']]);
        $current = $check->fetch(PDO::FETCH_ASSOC);
        if (!$current) return jsonResponse($response, ['error'=>true,'message'=>'Transacción no encontrada'], 404);
        if ((int)$current['transfer'] > 0) {
            return jsonResponse($response, ['error'=>true,'message'=>'Una transferencia no se edita: bórrala y haz otra.'], 409);
        }

        $data = $request->getParsedBody() ?? [];
        $fields = []; $params = [':id'=>$id];

        if (array_key_exists('description', $data)) {
            $desc = trim((string)$data['description']);
            if ($desc === '') return jsonResponse($response, ['error'=>true,'message'=>'Descripción vacía'], 400);
            $fields[] = 'description = :description'; $params[':description'] = $desc;
        }
        if (array_key_exists('amount', $data)) {
            $a = (float)$data['amount'];
            if (!is_finite($a) || $a <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
            $fields[] = 'amount = :amount'; $params[':amount'] = $a;
        }
        if (array_key_exists('type', $data)) {
            if (!in_array($data['type'], ['expense','income'], true)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
            }
            $fields[] = 'type = :type'; $params[':type'] = $data['type'];
        }
        if (array_key_exists('transaction_date', $data)) {
            if (!validDate((string)$data['transaction_date'])) {
                return jsonResponse($response, ['error'=>true,'message'=>'Fecha inválida'], 400);
            }
            $fields[] = 'transaction_date = :td'; $params[':td'] = $data['transaction_date'];
        }
        if (array_key_exists('category_id', $data)) {
            $cat = $data['category_id'] === null || $data['category_id'] === '' ? null : (int)$data['category_id'];
            if ($cat !== null) {
                if (!userCanUseCategory($conn, (int)$jwt['user_id'], $cat)) {
                    return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
                }
            }
            $fields[] = 'category_id = :cat'; $params[':cat'] = $cat;
        }
        if (array_key_exists('payment_method', $data)) {
            $pm = $data['payment_method'] === null || $data['payment_method'] === '' ? null : (string)$data['payment_method'];
            if (!validPaymentMethod($pm)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Tipo de pago inválido'], 400);
            }
            $fields[] = 'payment_method = :pm'; $params[':pm'] = $pm;
        }
        if (array_key_exists('notes', $data)) {
            $fields[] = 'notes = :notes'; $params[':notes'] = $data['notes'] ?: null;
        }
        // Fase 4: permitir cambiar el scope. Las transacciones ligadas a metas
        // (goal_id != null) tienen scope inmutable (decisión §2 del plan):
        // para "mover" una contribución entre month/historical se debe retirar
        // y volver a aportar. Rechazamos el cambio aquí para preservar la
        // invariante contable.
        if (array_key_exists('scope', $data)) {
            $sc = (string)$data['scope'];
            if (!validScope($sc) || $sc === '') {
                return jsonResponse($response, ['error'=>true,'message'=>'Scope inválido'], 400);
            }
            if ($sc === 'historical') {
                return jsonResponse($response, ['error'=>true,'message'=>'Para mover dinero a "Mis ahorros", usa una transferencia.'], 400);
            }
            // Comprobar si la tx está ligada a una meta.
            $isGoalTx = $conn->prepare("SELECT goal_id FROM transactions WHERE id = :id");
            $isGoalTx->execute([':id' => $id]);
            $goalRow = $isGoalTx->fetch(PDO::FETCH_ASSOC);
            if ($goalRow && $goalRow['goal_id'] !== null) {
                return jsonResponse($response, [
                    'error'   => true,
                    'message' => 'El scope de una contribución a meta es inmutable. Retira y vuelve a aportar para cambiarlo.'
                ], 409);
            }
            $fields[] = 'scope = :sc'; $params[':sc'] = $sc;
        }

        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);

        $stmt = $conn->prepare("UPDATE transactions SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);
        return jsonResponse($response, ['success'=>true]);
    });

    // Transferencia entre "Saldo del mes" y "Mis ahorros" (lo único que mueve dinero a ahorro).
    $group->post('/savings/transfer', function (Request $request, Response $response) use ($conn) {
        $uid  = (int)$request->getAttribute('user')['user_id'];
        $data = $request->getParsedBody() ?? [];
        $direction = $data['direction'] ?? '';
        if (!in_array($direction, ['to_savings', 'to_spending'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Dirección no válida'], 400);
        }
        $amount = is_numeric($data['amount'] ?? null) ? round((float)$data['amount'], 2) : 0.0;
        if ($amount <= 0 || $amount > 9999999999.99) {
            return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        }
        $toSavings = $direction === 'to_savings';
        $available = round($toSavings ? currentPeriodAvailable($conn, $uid) : historicalAvailable($conn, $uid), 2);
        if ($amount > $available) {
            $pool = $toSavings ? 'el saldo del mes' : 'Mis ahorros';
            return jsonResponse($response, [
                'error' => true,
                'message' => 'Solo hay ' . number_format(max(0, $available), 2, ',', '.') . " disponibles en $pool.",
                'available' => $available,
            ], 400);
        }
        $id = insertSavingsTransfer($conn, $uid, $direction, $amount, date('Y-m-d'), 1);
        $st = $conn->prepare("
            SELECT t.id, t.amount, t.description, t.type, t.transaction_date, t.notes,
                   t.payment_method, t.recurring_id, t.goal_id, t.scope, t.transfer,
                   t.category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   t.created_at, t.updated_at
            FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = :id AND t.user_id = :u
        ");
        $st->execute([':id' => $id, ':u' => $uid]);
        return jsonResponse($response, ['success' => true, 'transaction' => $st->fetch(PDO::FETCH_ASSOC)], 201);
    });

    $group->delete('/transactions/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $txId = (int)$args['id'];

        // Leer receipt_path antes de borrar la fila para poder unlink el archivo.
        $rp = $conn->prepare("SELECT receipt_path FROM transactions WHERE id = :id AND user_id = :u LIMIT 1");
        $rp->execute([':id' => $txId, ':u' => $uid]);
        $rpRow = $rp->fetch(PDO::FETCH_ASSOC);

        $stmt = $conn->prepare("DELETE FROM transactions WHERE id = :id AND user_id = :u");
        $stmt->execute([':id' => $txId, ':u' => $uid]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);

        // Borrar archivo de recibo si existía (silencioso: no falla la petición si unlink falla).
        if ($rpRow && !empty($rpRow['receipt_path'])) {
            $physPath = __DIR__ . DIRECTORY_SEPARATOR . (string)$rpRow['receipt_path'];
            // Validar que la ruta resuelta está dentro de Images/ (sin path traversal).
            $imagesBase = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'Images');
            $resolved   = realpath($physPath);
            if ($imagesBase && $resolved && strpos($resolved, $imagesBase . DIRECTORY_SEPARATOR) === 0) {
                @unlink($resolved);
            }
        }

        return jsonResponse($response, ['success'=>true]);
    });

    // ------ TRANSACTION RECEIPTS ------
    // POST /transactions/{id}/receipt  — sube o reemplaza la foto del recibo.
    // Solo usuarios Plus/Lifetime (gate server-side sobre feature 'receipt_photos').
    $group->post('/transactions/{id}/receipt', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $txId = (int)$args['id'];

        // (a) Propiedad: la transacción existe y pertenece al usuario.
        $chk = $conn->prepare("SELECT id, receipt_path FROM transactions WHERE id = :id AND user_id = :u LIMIT 1");
        $chk->execute([':id' => $txId, ':u' => $uid]);
        $tx = $chk->fetch(PDO::FETCH_ASSOC);
        if (!$tx) {
            return jsonResponse($response, ['error'=>true,'message'=>'Transacción no encontrada'], 404);
        }

        // (b) Gate Plus server-side — verifica feature 'receipt_photos' en el plan activo.
        $ent = getUserEntitlements($conn, $uid);
        if (empty($ent['features']['receipt_photos'])) {
            return jsonResponse($response, [
                'error'   => true,
                'code'    => 'plan_limit_reached',
                'message' => 'Adjuntar recibos requiere ChillPocket Plus.',
                'entity'  => 'receipt_photos',
                'plan'    => $ent['plan_code'],
            ], 403);
        }

        // (c) Verificar que GD está disponible — sin él no podemos re-encodar de forma segura.
        if (!extension_loaded('gd')) {
            error_log('[receipt/upload] Extensión GD no disponible en este servidor');
            return jsonResponse($response, ['error'=>true,'message'=>'Error interno del servidor (imagen no procesable)'], 500);
        }

        // (d) Obtener el archivo subido desde $_FILES (multipart).
        $files = $request->getUploadedFiles();
        if (empty($files['receipt'])) {
            // $_FILES puede estar disponible directamente si Slim no lo procesó.
            if (empty($_FILES['receipt']) || $_FILES['receipt']['error'] !== UPLOAD_ERR_OK) {
                $uploadErr = $_FILES['receipt']['error'] ?? UPLOAD_ERR_NO_FILE;
                if ($uploadErr === UPLOAD_ERR_INI_SIZE || $uploadErr === UPLOAD_ERR_FORM_SIZE) {
                    return jsonResponse($response, ['error'=>true,'message'=>'El archivo supera el tamaño permitido (máx. 5 MB)'], 413);
                }
                return jsonResponse($response, ['error'=>true,'message'=>'No se recibió ningún archivo en el campo "receipt"'], 400);
            }
            $tmpPath  = (string)$_FILES['receipt']['tmp_name'];
            $fileSize = (int)$_FILES['receipt']['size'];
        } else {
            /** @var \Psr\Http\Message\UploadedFileInterface $uploaded */
            $uploaded = $files['receipt'];
            if ($uploaded->getError() !== UPLOAD_ERR_OK) {
                $uploadErr = $uploaded->getError();
                if ($uploadErr === UPLOAD_ERR_INI_SIZE || $uploadErr === UPLOAD_ERR_FORM_SIZE) {
                    return jsonResponse($response, ['error'=>true,'message'=>'El archivo supera el tamaño permitido (máx. 5 MB)'], 413);
                }
                return jsonResponse($response, ['error'=>true,'message'=>'Error al recibir el archivo'], 400);
            }
            // Mover a temporal para poder leerlo de forma estándar.
            $tmpPath  = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'rcp_' . bin2hex(random_bytes(8));
            $uploaded->moveTo($tmpPath);
            $fileSize = (int)$uploaded->getSize();
        }

        // (c) Tamaño <= 5 MB validado en código, independientemente de php.ini.
        $maxBytes = 5 * 1024 * 1024;
        if ($fileSize > $maxBytes) {
            @unlink($tmpPath);
            return jsonResponse($response, ['error'=>true,'message'=>'El archivo supera el límite de 5 MB'], 413);
        }
        // Leer los primeros bytes para magia.
        $handle = @fopen($tmpPath, 'rb');
        if (!$handle) {
            @unlink($tmpPath);
            error_log('[receipt/upload] No se pudo abrir tmp: ' . $tmpPath);
            return jsonResponse($response, ['error'=>true,'message'=>'Error al procesar el archivo'], 500);
        }
        $header = fread($handle, 12);
        fclose($handle);

        // (d) Validar magic bytes: JPEG (FFD8FF), PNG (89504E47), WebP (52494646....57454250).
        $isJpeg = strlen($header) >= 3 && substr($header, 0, 3) === "\xFF\xD8\xFF";
        $isPng  = strlen($header) >= 4 && substr($header, 0, 4) === "\x89PNG";
        $isWebp = strlen($header) >= 12
                  && substr($header, 0, 4) === 'RIFF'
                  && substr($header, 8, 4) === 'WEBP';

        if (!$isJpeg && !$isPng && !$isWebp) {
            @unlink($tmpPath);
            return jsonResponse($response, [
                'error'   => true,
                'message' => 'Formato no permitido. Solo se aceptan JPEG, PNG y WebP.',
            ], 415);
        }

        // (e) Confirmar imagen real con getimagesize y comprobar dimensiones.
        $imgInfo = @getimagesize($tmpPath);
        if (!$imgInfo || $imgInfo[0] === 0 || $imgInfo[1] === 0) {
            @unlink($tmpPath);
            return jsonResponse($response, ['error'=>true,'message'=>'El archivo no es una imagen válida'], 400);
        }
        $imgW = (int)$imgInfo[0];
        $imgH = (int)$imgInfo[1];
        // Límite por lado y por área total (anti decompression-bomb: 4000×4000=16MP
        // ya ~64MB en GD; cap el área para no agotar memoria con varias subidas).
        if ($imgW > 4000 || $imgH > 4000 || ($imgW * $imgH) > 24000000) {
            @unlink($tmpPath);
            return jsonResponse($response, [
                'error'   => true,
                'message' => 'Dimensiones demasiado grandes (máx. 4000 × 4000 px)',
            ], 400);
        }

        // Re-encodar con GD → JPEG calidad 85.
        // Esto: (1) strip EXIF/GPS, (2) neutraliza polyglots (SVG disfrazado, etc.),
        // (3) normaliza formato de salida a JPEG predecible.
        $rawData = @file_get_contents($tmpPath);
        @unlink($tmpPath); // ya no necesitamos el tmp
        if ($rawData === false) {
            error_log('[receipt/upload] No se pudo leer tmp después de subir');
            return jsonResponse($response, ['error'=>true,'message'=>'Error al procesar el archivo'], 500);
        }

        $gdImg = @imagecreatefromstring($rawData);
        if ($gdImg === false) {
            error_log('[receipt/upload] GD no pudo crear imagen desde raw data (user=' . $uid . ')');
            return jsonResponse($response, ['error'=>true,'message'=>'El archivo no es una imagen válida o está corrupto'], 400);
        }

        // Capturar salida JPEG en buffer.
        ob_start();
        $encOk = imagejpeg($gdImg, null, 85);
        $jpegData = ob_get_clean();
        imagedestroy($gdImg);

        if (!$encOk || $jpegData === false || strlen((string)$jpegData) === 0) {
            error_log('[receipt/upload] imagejpeg falló (user=' . $uid . ')');
            return jsonResponse($response, ['error'=>true,'message'=>'No se pudo procesar la imagen'], 500);
        }

        // Crear directorio de usuario si no existe.
        $imagesBase = __DIR__ . DIRECTORY_SEPARATOR . 'Images';
        $userDir    = $imagesBase . DIRECTORY_SEPARATOR . $uid;
        if (!is_dir($userDir)) {
            if (!mkdir($userDir, 0755, true)) {
                error_log('[receipt/upload] No se pudo crear directorio: ' . $userDir);
                return jsonResponse($response, ['error'=>true,'message'=>'Error interno al guardar el archivo'], 500);
            }
        }

        // Nombre aleatorio generado server-side (el nombre del cliente se ignora).
        $filename  = bin2hex(random_bytes(16)) . '.jpg';
        $newPath   = $userDir . DIRECTORY_SEPARATOR . $filename;
        $relPath   = 'Images' . DIRECTORY_SEPARATOR . $uid . DIRECTORY_SEPARATOR . $filename;
        // Usar '/' como separador en la BDD (portable y sin conflicto con realpath).
        $relPathDb = 'Images/' . $uid . '/' . $filename;

        if (file_put_contents($newPath, $jpegData) === false) {
            error_log('[receipt/upload] No se pudo escribir: ' . $newPath);
            return jsonResponse($response, ['error'=>true,'message'=>'Error interno al guardar el archivo'], 500);
        }

        // Si la transacción ya tenía recibo, borrar el anterior.
        $oldPath = (string)($tx['receipt_path'] ?? '');
        if ($oldPath !== '') {
            $oldPhys = realpath(__DIR__ . DIRECTORY_SEPARATOR . $oldPath);
            $baseReal = realpath($imagesBase);
            if ($baseReal && $oldPhys && strpos($oldPhys, $baseReal . DIRECTORY_SEPARATOR) === 0) {
                @unlink($oldPhys);
            }
        }

        // Actualizar receipt_path en la BDD.
        $upd = $conn->prepare("UPDATE transactions SET receipt_path = :rp WHERE id = :id AND user_id = :u");
        $upd->execute([':rp' => $relPathDb, ':id' => $txId, ':u' => $uid]);

        return jsonResponse($response, [
            'success'     => true,
            'receipt_url' => '/transactions/' . $txId . '/receipt',
        ]);
    });

    // DELETE /transactions/{id}/receipt  — borra la foto de recibo.
    $group->delete('/transactions/{id}/receipt', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $txId = (int)$args['id'];

        // Propiedad y lectura del path actual.
        $chk = $conn->prepare("SELECT id, receipt_path FROM transactions WHERE id = :id AND user_id = :u LIMIT 1");
        $chk->execute([':id' => $txId, ':u' => $uid]);
        $tx = $chk->fetch(PDO::FETCH_ASSOC);
        if (!$tx) {
            return jsonResponse($response, ['error'=>true,'message'=>'Transacción no encontrada'], 404);
        }

        // Borrar archivo físico si existe.
        $oldPath = (string)($tx['receipt_path'] ?? '');
        if ($oldPath !== '') {
            $imagesBase = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'Images');
            $physPath   = realpath(__DIR__ . DIRECTORY_SEPARATOR . $oldPath);
            if ($imagesBase && $physPath && strpos($physPath, $imagesBase . DIRECTORY_SEPARATOR) === 0) {
                @unlink($physPath);
            }
        }

        // Poner receipt_path a NULL (aunque ya fuera NULL no rompe nada).
        $upd = $conn->prepare("UPDATE transactions SET receipt_path = NULL WHERE id = :id AND user_id = :u");
        $upd->execute([':id' => $txId, ':u' => $uid]);

        return jsonResponse($response, ['success'=>true]);
    });

    // GET /transactions/{id}/receipt  — sirve la imagen del recibo (privada, autenticada).
    $group->get('/transactions/{id}/receipt', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $txId = (int)$args['id'];

        // Propiedad.
        $chk = $conn->prepare("SELECT receipt_path FROM transactions WHERE id = :id AND user_id = :u LIMIT 1");
        $chk->execute([':id' => $txId, ':u' => $uid]);
        $tx = $chk->fetch(PDO::FETCH_ASSOC);
        if (!$tx) {
            return jsonResponse($response, ['error'=>true,'message'=>'Transacción no encontrada'], 404);
        }

        $relPath = (string)($tx['receipt_path'] ?? '');
        if ($relPath === '') {
            return jsonResponse($response, ['error'=>true,'message'=>'Esta transacción no tiene recibo'], 404);
        }

        // Validar que la ruta física está dentro de Images/ (evita path traversal).
        $imagesBase = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'Images');
        $physPath   = realpath(__DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relPath));

        if (!$imagesBase || !$physPath || strpos($physPath, $imagesBase . DIRECTORY_SEPARATOR) !== 0) {
            error_log('[receipt/get] path traversal detectado — uid=' . $uid . ' txId=' . $txId . ' relPath=' . $relPath);
            return jsonResponse($response, ['error'=>true,'message'=>'Archivo no disponible'], 404);
        }

        if (!is_file($physPath)) {
            // El archivo no existe en disco pero hay ruta en BDD → limpiar referencia huérfana.
            $conn->prepare("UPDATE transactions SET receipt_path = NULL WHERE id = :id AND user_id = :u")
                 ->execute([':id' => $txId, ':u' => $uid]);
            return jsonResponse($response, ['error'=>true,'message'=>'Recibo no disponible'], 404);
        }

        // Determinar Content-Type por extensión real del archivo guardado.
        $ext = strtolower(pathinfo($physPath, PATHINFO_EXTENSION));
        $mime = match($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png'         => 'image/png',
            'webp'        => 'image/webp',
            default       => 'application/octet-stream',
        };

        // Enviar la imagen directamente con headers de seguridad apropiados.
        // Usamos la Response de Slim para ser compatibles con el middleware CORS.
        $imgData = @file_get_contents($physPath);
        if ($imgData === false) {
            error_log('[receipt/get] No se pudo leer el archivo: ' . $physPath);
            return jsonResponse($response, ['error'=>true,'message'=>'Error al servir el archivo'], 500);
        }

        $response->getBody()->write($imgData);
        return $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Disposition', 'inline; filename="receipt-' . $txId . '.jpg"')
            ->withHeader('Cache-Control', 'private, max-age=3600')
            ->withStatus(200);
    });

    // ------ TRANSACTIONS EXPORT ------
    // GET /transactions/export?format=csv[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
    // Descarga un CSV de todas las transacciones del usuario autenticado.
    // Requiere feature flag 'export' (Plus). Si el usuario free pide un rango
    // más antiguo que su history_months → 403. Un único LEFT JOIN con JOINs
    // a categories, recurring_expenses y savings_goals para no multiplicar
    // conexiones MySQL (cuota Hostinger). Máximo 50.000 filas; si se trunca
    // añade el header X-ChillPocket-Truncated: true.
    $group->get('/transactions/export', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $q   = $request->getQueryParams();

        // 1. Validar parámetro format (solo 'csv' por ahora).
        $format = isset($q['format']) ? strtolower(trim((string)$q['format'])) : '';
        if ($format !== 'csv') {
            return jsonResponse($response, [
                'error'   => true,
                'message' => "Parámetro 'format' obligatorio y debe ser 'csv'.",
            ], 400);
        }

        // 2. Gate de feature: el usuario debe tener la flag 'export' activa.
        $ent = getUserEntitlements($conn, $uid);
        if (empty($ent['features']['export'])) {
            return jsonResponse($response, [
                'error'   => true,
                'code'    => 'plan_limit_reached',
                'message' => 'Exportar tus datos requiere Plus.',
                'entity'  => 'export',
                'plan'    => $ent['plan_code'],
            ], 403);
        }

        // 3. Validar fechas opcionales y aplicar gate de historial para usuarios free.
        $fromParam = !empty($q['from']) && validDate($q['from']) ? $q['from'] : null;
        $toParam   = !empty($q['to'])   && validDate($q['to'])   ? $q['to']   : null;

        if ($fromParam !== null) {
            if ($err = enforceHistoryLimit($conn, $uid, null, $fromParam)) {
                return jsonResponse($response, $err, 403);
            }
        }

        // 4. Construir query con todos los JOINs necesarios en una sola pasada
        //    (sin N+1: categories, recurring_expenses, savings_goals en un SELECT).
        $sql = "
            SELECT
                t.transaction_date          AS fecha,
                t.type                      AS tipo,
                t.amount                    AS importe,
                u.currency                  AS moneda,
                COALESCE(c.name, 'Sin categoría') AS categoria,
                t.description               AS descripcion,
                COALESCE(t.payment_method, '') AS metodo_pago,
                COALESCE(t.notes, '')       AS notas,
                COALESCE(re.name, '')       AS recurrente,
                COALESCE(sg.name, '')       AS meta
            FROM transactions t
            INNER JOIN users u ON u.id = t.user_id
            LEFT JOIN categories c           ON c.id = t.category_id
            LEFT JOIN recurring_expenses re  ON re.id = t.recurring_id
            LEFT JOIN savings_goals sg       ON sg.id = t.goal_id
            WHERE t.user_id = :u
        ";
        $params = [':u' => $uid];

        if ($fromParam !== null) {
            $sql .= " AND t.transaction_date >= :from";
            $params[':from'] = $fromParam;
        }
        if ($toParam !== null) {
            $sql .= " AND t.transaction_date <= :to";
            $params[':to'] = $toParam;
        }

        // Más reciente primero, igual que en la app.
        $sql .= " ORDER BY t.transaction_date DESC, t.id DESC LIMIT 50001";

        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Detectar truncado (si traemos más de 50.000 filas).
        $truncated = count($rows) > 50000;
        if ($truncated) {
            $rows = array_slice($rows, 0, 50000);
        }

        // 5. Generar CSV en memoria con fputcsv (maneja escapado de comas,
        //    comillas y saltos de línea internos automáticamente).
        $stream = fopen('php://temp', 'r+b');

        // BOM UTF-8: hace que Excel detecte el encoding correctamente sin
        // que el usuario tenga que importar manualmente.
        fwrite($stream, "\xEF\xBB\xBF");

        // Escape '' = RFC 4180 (solo se doblan las comillas). Con el '\' por defecto,
        // `a\"b` sale sin doblar y Excel parte la celda; además PHP ≥ 8.4 avisa de
        // obsolescencia en CADA fila (una línea de log por movimiento exportado).
        $csvEscape = '';
        // Texto libre del usuario: un apóstrofo delante evita que Excel/Sheets lo
        // ejecute como fórmula (=HYPERLINK(...), +cmd, @SUM...).
        $csvText = static fn($v): string => preg_match('/^[=+\-@\t\r]/', (string)$v) ? "'" . $v : (string)$v;

        // Encabezados en español, sin acentos, para máxima compat con Excel.
        fputcsv($stream, ['fecha','tipo','importe','moneda','categoria','descripcion','metodo_pago','notas','recurrente','meta'], ',', '"', $csvEscape);

        foreach ($rows as $row) {
            fputcsv($stream, [
                $row['fecha'],
                $row['tipo'],
                number_format((float)$row['importe'], 2, '.', ''), // punto decimal, sin miles
                $row['moneda'],
                $csvText($row['categoria']),
                $csvText($row['descripcion']),
                $row['metodo_pago'],
                $csvText($row['notas']),
                $csvText($row['recurrente']),
                $csvText($row['meta']),
            ], ',', '"', $csvEscape);
        }

        // Leer el contenido generado.
        rewind($stream);
        $csvBody = stream_get_contents($stream);
        fclose($stream);

        // 6. Enviar respuesta con los headers correctos.
        $filename = 'chillpocket-' . date('Y-m-d') . '.csv';
        $response = $response
            ->withHeader('Content-Type', 'text/csv; charset=utf-8')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $filename . '"')
            ->withHeader('Cache-Control', 'no-store');

        if ($truncated) {
            $response = $response->withHeader('X-ChillPocket-Truncated', 'true');
        }

        $response->getBody()->write($csvBody);
        return $response;
    });

    // ------ RECURRING ------
    $group->get('/recurring', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("
            SELECT r.id, r.name, r.amount, r.type, r.frequency, r.start_date, r.end_date,
                   r.is_active, r.notes, r.category_id,
                   c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   r.created_at, r.updated_at
            FROM recurring_expenses r
            LEFT JOIN categories c ON r.category_id = c.id
            WHERE r.user_id = :u
            ORDER BY r.is_active DESC, r.frequency, r.name
        ");
        $stmt->execute([':u' => (int)$jwt['user_id']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $monthlyExpense = 0.0;
        $monthlyIncome  = 0.0;
        foreach ($rows as $r) {
            if (!(int)$r['is_active']) continue;
            $eq = monthlyEquivalent((float)$r['amount'], (string)$r['frequency']);
            if ($r['type'] === 'income') $monthlyIncome += $eq; else $monthlyExpense += $eq;
        }

        return jsonResponse($response, [
            'recurring' => $rows,
            'projection' => [
                'monthly_expense' => round($monthlyExpense, 2),
                'monthly_income'  => round($monthlyIncome, 2),
                'yearly_expense'  => round($monthlyExpense * 12, 2),
                'yearly_income'   => round($monthlyIncome * 12, 2),
            ]
        ]);
    });

    $group->post('/recurring', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $data = $request->getParsedBody() ?? [];

        if ($err = enforcePlanLimit($conn, $uid, 'recurring')) {
            return jsonResponse($response, $err, 403);
        }

        $name      = trim((string)($data['name'] ?? ''));
        $amount    = isset($data['amount']) ? (float)$data['amount'] : -1;
        $frequency = (string)($data['frequency'] ?? 'monthly');
        $type      = (string)($data['type'] ?? 'expense');
        $start     = trim((string)($data['start_date'] ?? ''));
        $end       = isset($data['end_date']) && $data['end_date'] !== '' ? trim((string)$data['end_date']) : null;
        $catId     = isset($data['category_id']) && $data['category_id'] !== '' ? (int)$data['category_id'] : null;
        $notes     = isset($data['notes']) ? trim((string)$data['notes']) : null;

        if ($name === '')   return jsonResponse($response, ['error'=>true,'message'=>'Nombre obligatorio'], 400);
        if (!is_finite($amount) || $amount <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        if (!in_array($frequency, ['weekly','monthly','yearly'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Frecuencia inválida'], 400);
        }
        if (!in_array($type, ['expense','income'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
        }
        if (!validDate($start)) return jsonResponse($response, ['error'=>true,'message'=>'Fecha inicio inválida'], 400);
        if ($end !== null && !validDate($end)) return jsonResponse($response, ['error'=>true,'message'=>'Fecha fin inválida'], 400);

        if ($catId !== null) {
            if (!userCanUseCategory($conn, (int)$jwt['user_id'], $catId)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
            }
        }

        $stmt = $conn->prepare("
            INSERT INTO recurring_expenses (user_id, category_id, name, amount, type, frequency, start_date, end_date, notes)
            VALUES (:u, :c, :n, :a, :t, :f, :s, :e, :no)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$catId, ':n'=>$name,
            ':a'=>$amount, ':t'=>$type, ':f'=>$frequency,
            ':s'=>$start, ':e'=>$end, ':no'=>$notes ?: null
        ]);

        // Capturar el id del recurrente ANTES de expandir: expandRecurringTransactions
        // inserta transacciones y dejaría lastInsertId() apuntando a la última de
        // ellas, devolviendo un id equivocado al cliente (rompía el borrado del demo).
        $newId = (int)$conn->lastInsertId();

        // Regenerar transacciones inmediatamente
        try { expandRecurringTransactions($conn, (int)$jwt['user_id']); } catch (Throwable $e) {}
        return jsonResponse($response, ['success'=>true,'id'=>$newId], 201);
    });

    $group->put('/recurring/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $id  = (int)$args['id'];
        $check = $conn->prepare("SELECT id FROM recurring_expenses WHERE id = :id AND user_id = :u");
        $check->execute([':id'=>$id, ':u'=>(int)$jwt['user_id']]);
        if (!$check->fetch()) return jsonResponse($response, ['error'=>true,'message'=>'No encontrado'], 404);

        $data = $request->getParsedBody() ?? [];
        $fields = []; $params = [':id'=>$id];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre vacío'], 400);
            $fields[] = 'name = :name'; $params[':name'] = $name;
        }
        if (array_key_exists('amount', $data)) {
            $a = (float)$data['amount'];
            if (!is_finite($a) || $a <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
            $fields[] = 'amount = :amount'; $params[':amount'] = $a;
        }
        if (array_key_exists('type', $data)) {
            if (!in_array($data['type'], ['expense','income'], true)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
            }
            $fields[] = 'type = :type'; $params[':type'] = $data['type'];
        }
        if (array_key_exists('frequency', $data)) {
            if (!in_array($data['frequency'], ['weekly','monthly','yearly'], true)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Frecuencia inválida'], 400);
            }
            $fields[] = 'frequency = :f'; $params[':f'] = $data['frequency'];
        }
        if (array_key_exists('start_date', $data)) {
            if (!validDate((string)$data['start_date'])) {
                return jsonResponse($response, ['error'=>true,'message'=>'Fecha inválida'], 400);
            }
            $fields[] = 'start_date = :s'; $params[':s'] = $data['start_date'];
        }
        if (array_key_exists('end_date', $data)) {
            $end = $data['end_date'] === null || $data['end_date'] === '' ? null : (string)$data['end_date'];
            if ($end !== null && !validDate($end)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Fecha fin inválida'], 400);
            }
            $fields[] = 'end_date = :e'; $params[':e'] = $end;
        }
        if (array_key_exists('is_active', $data)) {
            $fields[] = 'is_active = :ia'; $params[':ia'] = (int)(bool)$data['is_active'];
        }
        if (array_key_exists('category_id', $data)) {
            $cat = $data['category_id'] === null || $data['category_id'] === '' ? null : (int)$data['category_id'];
            if ($cat !== null) {
                if (!userCanUseCategory($conn, (int)$jwt['user_id'], $cat)) {
                    return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
                }
            }
            $fields[] = 'category_id = :c'; $params[':c'] = $cat;
        }
        if (array_key_exists('notes', $data)) {
            $fields[] = 'notes = :no'; $params[':no'] = $data['notes'] ?: null;
        }

        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);
        $stmt = $conn->prepare("UPDATE recurring_expenses SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);
        return jsonResponse($response, ['success'=>true]);
    });

    // PATCH y POST aceptados (POST como alias por si algún proxy bloquea PATCH)
    $toggleHandler = function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("
            UPDATE recurring_expenses SET is_active = 1 - is_active
            WHERE id = :id AND user_id = :u
        ");
        $stmt->execute([':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
    };
    $group->patch('/recurring/{id}/toggle', $toggleHandler);
    $group->post('/recurring/{id}/toggle',  $toggleHandler);

    // Forzar la generación bajo demanda (útil para depurar)
    $group->post('/recurring/run', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        expandRecurringTransactions($conn, (int)$jwt['user_id']);
        return jsonResponse($response, ['success'=>true]);
    });

    $group->delete('/recurring/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("DELETE FROM recurring_expenses WHERE id = :id AND user_id = :u");
        $stmt->execute([':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
    });

    // ------ SAVINGS GOALS ------
    $group->get('/savings-goals', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $stmt = $conn->prepare("
            SELECT id, name, target_amount, current_amount, target_date, description, color, icon,
                   is_completed, created_at, updated_at,
                   CASE WHEN target_amount > 0
                        THEN ROUND((current_amount / target_amount) * 100, 2)
                        ELSE 0 END AS progress_pct,
                   CASE WHEN target_date IS NOT NULL
                        THEN DATEDIFF(target_date, CURDATE())
                        ELSE NULL END AS days_remaining
            FROM savings_goals
            WHERE user_id = :u
            ORDER BY is_completed ASC, target_date IS NULL, target_date ASC
        ");
        $stmt->execute([':u' => $uid]);
        return jsonResponse($response, [
            'goals' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'available_balance' => round(availableBalance($conn, $uid), 2),
        ]);
    });

    $group->post('/savings-goals', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $data = $request->getParsedBody() ?? [];
        if ($err = enforcePlanLimit($conn, $uid, 'goals')) {
            return jsonResponse($response, $err, 403);
        }
        $name   = trim((string)($data['name'] ?? ''));
        $target = isset($data['target_amount']) ? (float)$data['target_amount'] : 0;
        $date   = isset($data['target_date']) && $data['target_date'] !== '' ? (string)$data['target_date'] : null;
        $desc   = isset($data['description']) ? trim((string)$data['description']) : null;
        $color  = validHexColor($data['color'] ?? null, '#10B981');
        $icon   = isset($data['icon']) ? trim((string)$data['icon']) : null;

        if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre obligatorio'], 400);
        if ($target <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Monto objetivo debe ser > 0'], 400);
        if ($date !== null && !validDate($date)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Fecha objetivo inválida'], 400);
        }

        // Las metas siempre arrancan a 0. Para "rellenarla" el usuario debe
        // aportar explícitamente con /contribute, que registra la transacción.
        $stmt = $conn->prepare("
            INSERT INTO savings_goals
                (user_id, name, target_amount, current_amount, target_date, description, color, icon, is_completed)
            VALUES (:u, :n, :t, 0, :td, :d, :c, :i, 0)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':n'=>$name, ':t'=>$target,
            ':td'=>$date, ':d'=>$desc ?: null,
            ':c'=>$color, ':i'=>$icon ?: null,
        ]);
        return jsonResponse($response, ['success'=>true,'id'=>(int)$conn->lastInsertId()], 201);
    });

    $group->put('/savings-goals/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $id  = (int)$args['id'];
        $check = $conn->prepare("SELECT id FROM savings_goals WHERE id = :id AND user_id = :u");
        $check->execute([':id'=>$id, ':u'=>(int)$jwt['user_id']]);
        if (!$check->fetch()) return jsonResponse($response, ['error'=>true,'message'=>'No encontrada'], 404);

        $data = $request->getParsedBody() ?? [];
        $fields = []; $params = [':id'=>$id];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre vacío'], 400);
            $fields[] = 'name = :name'; $params[':name'] = $name;
        }
        if (array_key_exists('target_amount', $data)) {
            $t = (float)$data['target_amount'];
            if ($t <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Objetivo inválido'], 400);
            $fields[] = 'target_amount = :t'; $params[':t'] = $t;
        }
        // current_amount NO se actualiza por PUT: debe pasar por /contribute
        // para registrar la transacción correspondiente y mantener cuadrada
        // la contabilidad.
        if (array_key_exists('target_date', $data)) {
            $td = $data['target_date'] === null || $data['target_date'] === '' ? null : (string)$data['target_date'];
            if ($td !== null && !validDate($td)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Fecha inválida'], 400);
            }
            $fields[] = 'target_date = :td'; $params[':td'] = $td;
        }
        if (array_key_exists('description', $data)) {
            $fields[] = 'description = :d'; $params[':d'] = $data['description'] ?: null;
        }
        if (array_key_exists('color', $data)) {
            $fields[] = 'color = :c'; $params[':c'] = validHexColor($data['color'], '#10B981');
        }
        if (array_key_exists('icon', $data)) {
            $fields[] = 'icon = :i'; $params[':i'] = $data['icon'] ?: null;
        }
        if (array_key_exists('is_completed', $data)) {
            $fields[] = 'is_completed = :ic'; $params[':ic'] = (int)(bool)$data['is_completed'];
        }

        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);
        $stmt = $conn->prepare("UPDATE savings_goals SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);
        return jsonResponse($response, ['success'=>true]);
    });

    // Aportar o retirar de una meta:
    //  amount > 0  ->  aportación  (crea transacción de gasto categoría "Ahorro")
    //  amount < 0  ->  retirada    (crea transacción de ingreso categoría "Ahorro")
    // Invariantes:
    //  - aportar más que el saldo disponible está bloqueado
    //  - retirar más del current_amount de la meta está bloqueado
    $group->post('/savings-goals/{id}/contribute', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $gid  = (int)$args['id'];
        $data = $request->getParsedBody() ?? [];
        $amount = isset($data['amount']) ? (float)$data['amount'] : 0;
        if ($amount === 0.0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);

        // Fase 4: scope opcional ('month' default | 'historical').
        // Aporte:    valida contra el saldo del scope elegido (mes o histórico).
        // Retirada:  la tx ingreso resultante hereda el scope (a dónde va el dinero).
        $scope = isset($data['scope']) && $data['scope'] !== '' ? (string)$data['scope'] : 'month';
        if (!validScope($scope) || $scope === '') {
            return jsonResponse($response, ['error'=>true,'message'=>'Scope inválido'], 400);
        }

        $sel = $conn->prepare("SELECT name, current_amount, target_amount FROM savings_goals WHERE id = :id AND user_id = :u");
        $sel->execute([':id'=>$gid, ':u'=>$uid]);
        $goal = $sel->fetch(PDO::FETCH_ASSOC);
        if (!$goal) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);

        $current = (float)$goal['current_amount'];
        if ($amount > 0) {
            $available = $scope === 'historical'
                ? historicalAvailable($conn, $uid)
                : currentPeriodAvailable($conn, $uid);
            if ($amount > $available + 0.001) {
                $poolName = $scope === 'historical' ? 'Mis ahorros' : 'Saldo del mes';
                return jsonResponse($response, [
                    'error'   => true,
                    'message' => 'Saldo insuficiente en ' . $poolName . '. Disponible: ' . number_format($available, 2),
                ], 400);
            }
        } else {
            // retirada: no puedes sacar más de lo que la meta tiene
            if ($current + $amount < -0.001) {
                return jsonResponse($response, [
                    'error'=>true,
                    'message'=>'La meta solo tiene ' . number_format($current, 2)
                ], 400);
            }
        }

        $catId = savingsCategoryId($conn);
        $txType = $amount > 0 ? 'expense' : 'income';
        $txAmount = abs($amount);
        $txDescription = $amount > 0
            ? 'Aportación a "' . $goal['name'] . '"'
            : 'Retirada de "' . $goal['name'] . '"';

        try {
            $conn->beginTransaction();

            $insTx = $conn->prepare("
                INSERT INTO transactions
                    (user_id, category_id, amount, description, type, transaction_date, notes, goal_id, scope)
                VALUES (:u, :c, :a, :d, :t, CURDATE(), :n, :g, :sc)
            ");
            $insTx->execute([
                ':u'=>$uid, ':c'=>$catId, ':a'=>$txAmount,
                ':d'=>$txDescription, ':t'=>$txType,
                ':n'=>'Movimiento de meta de ahorro',
                ':g'=>$gid,
                ':sc'=>$scope,
            ]);

            $upd = $conn->prepare("
                UPDATE savings_goals
                SET current_amount = GREATEST(0, current_amount + :a),
                    is_completed = CASE WHEN current_amount + :a >= target_amount THEN 1 ELSE 0 END
                WHERE id = :id AND user_id = :u
            ");
            $upd->execute([':a'=>$amount, ':id'=>$gid, ':u'=>$uid]);

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            return jsonResponse($response, ['error'=>true,'message'=>'No se pudo registrar el movimiento'], 500);
        }

        // Devolver estado actualizado de la meta y nuevo balance disponible
        $newAvail = availableBalance($conn, $uid);
        $stmt = $conn->prepare("SELECT current_amount, target_amount FROM savings_goals WHERE id = :id");
        $stmt->execute([':id'=>$gid]);
        $g = $stmt->fetch(PDO::FETCH_ASSOC);
        return jsonResponse($response, [
            'success' => true,
            'goal' => [
                'id' => $gid,
                'current_amount' => (float)$g['current_amount'],
                'target_amount'  => (float)$g['target_amount'],
            ],
            'available_balance' => round($newAvail, 2),
        ]);
    });

    $group->delete('/savings-goals/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("DELETE FROM savings_goals WHERE id = :id AND user_id = :u");
        $stmt->execute([':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
    });

    // ------ BUDGETS ------
    $group->get('/budgets', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $month = $request->getQueryParams()['month_year'] ?? date('Y-m');
        if (!validMonthYear($month)) {
            return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido (YYYY-MM)'], 400);
        }
        // Clonado lazy desde el mes anterior si hay presupuestos con auto_renew=1.
        // Si falla (p.ej. columna aún no migrada), logueamos y continuamos normalmente.
        try { autoRenewBudgets($conn, $uid, $month); } catch (Throwable $e) {
            error_log('[autoRenewBudgets] ' . $e->getMessage());
        }
        // El gasto se calcula a partir del reset_day del presupuesto:
        // ventana = [año-mes-reset_day, +1 mes). Si reset_day = 1 equivale al mes natural.
        $stmt = $conn->prepare("
            SELECT b.id, b.amount, b.month_year, b.reset_day, b.category_id, b.auto_renew,
                   c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   COALESCE((
                       SELECT SUM(t.amount) FROM transactions t
                       WHERE t.user_id = b.user_id
                         AND t.type = 'expense'
                         AND t.transaction_date >= STR_TO_DATE(CONCAT(b.month_year, '-', LPAD(b.reset_day, 2, '0')), '%Y-%m-%d')
                         AND t.transaction_date <  STR_TO_DATE(CONCAT(b.month_year, '-', LPAD(b.reset_day, 2, '0')), '%Y-%m-%d') + INTERVAL 1 MONTH
                         AND (b.category_id IS NULL OR t.category_id = b.category_id)
                   ), 0) AS spent
            FROM budgets b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE b.user_id = :u AND b.month_year = :m
            ORDER BY b.category_id IS NULL DESC, c.name
        ");
        $stmt->execute([':u' => $uid, ':m' => $month]);
        return jsonResponse($response, [
            'budgets'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'month_year' => $month
        ]);
    });

    $group->post('/budgets', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $uid  = (int)$jwt['user_id'];
        $data = $request->getParsedBody() ?? [];
        $amount = isset($data['amount']) ? (float)$data['amount'] : -1;
        $month  = (string)($data['month_year'] ?? '');
        $catId  = isset($data['category_id']) && $data['category_id'] !== '' ? (int)$data['category_id'] : null;
        $resetDay   = isset($data['reset_day']) ? (int)$data['reset_day'] : 1;
        if ($resetDay < 1 || $resetDay > 28) $resetDay = 1;
        $autoRenew  = !empty($data['auto_renew']) ? 1 : 0;

        // Enforcement por plan: nº de presupuestos en este mes_year.
        if (validMonthYear($month) && ($err = enforcePlanLimit($conn, $uid, 'budgets', $month))) {
            // Si el plan es upsert sobre uno existente, no contamos como "nuevo".
            // Comprobamos: ¿ya existe budget para (uid, month, cat)?
            $check = $conn->prepare("SELECT id FROM budgets WHERE user_id = :u AND month_year = :m AND ((:c IS NULL AND category_id IS NULL) OR category_id = :c) LIMIT 1");
            $check->execute([':u' => $uid, ':m' => $month, ':c' => $catId]);
            if (!$check->fetch()) {
                return jsonResponse($response, $err, 403);
            }
        }

        if (!is_finite($amount) || $amount <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        if (!validMonthYear($month)) return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido'], 400);

        if ($catId !== null) {
            if (!userCanUseCategory($conn, (int)$jwt['user_id'], $catId)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
            }
        }

        $stmt = $conn->prepare("
            INSERT INTO budgets (user_id, category_id, amount, month_year, reset_day, auto_renew)
            VALUES (:u, :c, :a, :m, :rd, :ar)
            ON DUPLICATE KEY UPDATE amount = VALUES(amount), reset_day = VALUES(reset_day), auto_renew = VALUES(auto_renew)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$catId, ':a'=>$amount, ':m'=>$month, ':rd'=>$resetDay, ':ar'=>$autoRenew
        ]);
        return jsonResponse($response, ['success'=>true], 201);
    });

    $group->put('/budgets/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $id  = (int)$args['id'];
        $check = $conn->prepare("SELECT id FROM budgets WHERE id = :id AND user_id = :u");
        $check->execute([':id'=>$id, ':u'=>(int)$jwt['user_id']]);
        if (!$check->fetch()) return jsonResponse($response, ['error'=>true,'message'=>'Presupuesto no encontrado'], 404);

        $data = $request->getParsedBody() ?? [];
        $fields = []; $params = [':id'=>$id];

        if (array_key_exists('amount', $data)) {
            $a = (float)$data['amount'];
            if (!is_finite($a) || $a <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
            $fields[] = 'amount = :amount'; $params[':amount'] = $a;
        }
        if (array_key_exists('reset_day', $data)) {
            $rd = (int)$data['reset_day'];
            if ($rd < 1 || $rd > 28) return jsonResponse($response, ['error'=>true,'message'=>'reset_day fuera de rango (1-28)'], 400);
            $fields[] = 'reset_day = :rd'; $params[':rd'] = $rd;
        }
        if (array_key_exists('auto_renew', $data)) {
            $fields[] = 'auto_renew = :ar'; $params[':ar'] = !empty($data['auto_renew']) ? 1 : 0;
        }
        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);

        $stmt = $conn->prepare("UPDATE budgets SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);
        return jsonResponse($response, ['success'=>true]);
    });

    $group->delete('/budgets/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("DELETE FROM budgets WHERE id = :id AND user_id = :u");
        $stmt->execute([':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
    });

    // ------ ANALYTICS ------
    $group->get('/analytics/summary', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $month = $request->getQueryParams()['month_year'] ?? date('Y-m');
        if (!validMonthYear($month)) {
            return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido'], 400);
        }

        $stmt = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense,
                COUNT(*) AS total_transactions
            FROM transactions
            WHERE user_id = :u AND DATE_FORMAT(transaction_date, '%Y-%m') = :m
        ");
        $stmt->execute([':u'=>$uid, ':m'=>$month]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['total_income'=>0,'total_expense'=>0,'total_transactions'=>0];

        $totalIncome  = (float)($row['total_income']  ?? 0);
        $totalExpense = (float)($row['total_expense'] ?? 0);
        $balance      = $totalIncome - $totalExpense;
        $savingsRatio = $totalIncome > 0 ? round(($balance / $totalIncome) * 100, 2) : 0;

        $hist = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END)
              - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS net_total
            FROM transactions WHERE user_id = :u
        ");
        $hist->execute([':u'=>$uid]);
        $netTotal = (float)($hist->fetch(PDO::FETCH_ASSOC)['net_total'] ?? 0);

        $g = $conn->prepare("SELECT COALESCE(SUM(current_amount),0) AS saved FROM savings_goals WHERE user_id = :u");
        $g->execute([':u'=>$uid]);
        $totalSaved = (float)($g->fetch(PDO::FETCH_ASSOC)['saved'] ?? 0);

        $rec = $conn->prepare("
            SELECT type, frequency, amount
            FROM recurring_expenses
            WHERE user_id = :u AND is_active = 1
        ");
        $rec->execute([':u'=>$uid]);
        $recurringExpense = 0.0;
        $recurringIncome  = 0.0;
        foreach ($rec->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $eq = monthlyEquivalent((float)$r['amount'], (string)$r['frequency']);
            if ($r['type'] === 'income') $recurringIncome += $eq; else $recurringExpense += $eq;
        }

        // Comparativa con mes anterior
        $prev = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense
            FROM transactions
            WHERE user_id = :u AND DATE_FORMAT(transaction_date, '%Y-%m') =
                DATE_FORMAT(DATE_SUB(STR_TO_DATE(CONCAT(:m,'-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m')
        ");
        $prev->execute([':u'=>$uid, ':m'=>$month]);
        $prevRow = $prev->fetch(PDO::FETCH_ASSOC) ?: ['total_income'=>0,'total_expense'=>0];

        // Aportado neto a metas de ahorro este mes (envelope):
        // expense con goal_id = aportación, income con goal_id = retirada.
        $sv = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='expense' THEN amount ELSE -amount END) AS net_saved
            FROM transactions
            WHERE user_id = :u
              AND goal_id IS NOT NULL
              AND DATE_FORMAT(transaction_date, '%Y-%m') = :m
        ");
        $sv->execute([':u'=>$uid, ':m'=>$month]);
        $savedThisMonth = (float)($sv->fetch(PDO::FETCH_ASSOC)['net_saved'] ?? 0);

        return jsonResponse($response, [
            'month_year'           => $month,
            'total_income'         => round($totalIncome, 2),
            'total_expense'        => round($totalExpense, 2),
            'balance'              => round($balance, 2),
            'savings_ratio'        => $savingsRatio,
            'total_transactions'   => (int)($row['total_transactions'] ?? 0),
            'net_total_historical' => round($netTotal, 2),
            'total_saved_in_goals' => round($totalSaved, 2),
            'recurring_monthly'    => [
                'expense' => round($recurringExpense, 2),
                'income'  => round($recurringIncome, 2),
                'net'     => round($recurringIncome - $recurringExpense, 2)
            ],
            'previous'             => [
                'total_income'  => round((float)$prevRow['total_income'], 2),
                'total_expense' => round((float)$prevRow['total_expense'], 2),
            ],
            'saved_this_month'     => round($savedThisMonth, 2),
        ]);
    });

    $group->get('/analytics/monthly', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $months = max(1, min(24, (int)($request->getQueryParams()['months'] ?? 6)));

        $stmt = $conn->prepare("
            SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month_year,
                   SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
            FROM transactions
            WHERE user_id = :u
              AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL :m MONTH)
            GROUP BY month_year
            ORDER BY month_year ASC
        ");
        $stmt->bindValue(':u', (int)$jwt['user_id'], PDO::PARAM_INT);
        $stmt->bindValue(':m', $months - 1, PDO::PARAM_INT);
        $stmt->execute();
        return jsonResponse($response, ['monthly' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    });

    $group->get('/analytics/categories', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $month = $request->getQueryParams()['month_year'] ?? date('Y-m');
        if (!validMonthYear($month)) {
            return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido'], 400);
        }

        $stmt = $conn->prepare("
            SELECT t.category_id,
                   COALESCE(c.name, 'Sin categoría') AS category_name,
                   COALESCE(c.color, '#6B7280') AS category_color,
                   c.icon AS category_icon,
                   t.type,
                   SUM(t.amount) AS total,
                   COUNT(*) AS count
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = :u AND DATE_FORMAT(t.transaction_date, '%Y-%m') = :m
            GROUP BY t.category_id, t.type, c.name, c.color, c.icon
            ORDER BY total DESC
        ");
        $stmt->execute([':u'=>(int)$jwt['user_id'], ':m'=>$month]);
        return jsonResponse($response, [
            'month_year' => $month,
            'categories' => $stmt->fetchAll(PDO::FETCH_ASSOC)
        ]);
    });

    // Comparativa por categoría para los últimos N meses (matriz)
    $group->get('/analytics/category-comparison', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $months = max(2, min(12, (int)($request->getQueryParams()['months'] ?? 6)));

        $stmt = $conn->prepare("
            SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') AS month_year,
                   t.category_id,
                   COALESCE(c.name, 'Sin categoría') AS category_name,
                   COALESCE(c.color, '#6B7280') AS category_color,
                   SUM(t.amount) AS total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = :u
              AND t.type = 'expense'
              AND t.transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL :m MONTH)
            GROUP BY month_year, t.category_id, c.name, c.color
            ORDER BY month_year ASC, total DESC
        ");
        $stmt->bindValue(':u', (int)$jwt['user_id'], PDO::PARAM_INT);
        $stmt->bindValue(':m', $months - 1, PDO::PARAM_INT);
        $stmt->execute();
        return jsonResponse($response, ['rows' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    });

    $group->get('/analytics/payment-methods', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $month = $request->getQueryParams()['month_year'] ?? date('Y-m');
        if (!validMonthYear($month)) {
            return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido'], 400);
        }
        $stmt = $conn->prepare("
            SELECT COALESCE(payment_method, 'other') AS payment_method,
                   SUM(amount) AS total,
                   COUNT(*) AS count
            FROM transactions
            WHERE user_id = :u
              AND type = 'expense'
              AND DATE_FORMAT(transaction_date, '%Y-%m') = :m
            GROUP BY payment_method
            ORDER BY total DESC
        ");
        $stmt->execute([':u'=>(int)$jwt['user_id'], ':m'=>$month]);
        return jsonResponse($response, [
            'month_year'      => $month,
            'payment_methods' => $stmt->fetchAll(PDO::FETCH_ASSOC)
        ]);
    });

    // Endpoint combinado: devuelve TODO lo que la pantalla de analítica/dashboard
    // necesita en una sola petición. Diseñado para reducir el nº de conexiones
    // MySQL en hostings con cuotas estrictas (Hostinger: 500 conex/hora).
    // Reemplaza 7 llamadas (/summary + /monthly + /categories + /category-comparison
    // + /payment-methods + /trends + /projection) por una única consulta HTTP.
    $group->get('/analytics/all', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];
        $q   = $request->getQueryParams();
        $month  = $q['month_year'] ?? date('Y-m');
        $months = max(1, min(24, (int)($q['months']  ?? 6)));
        $days   = max(1, min(180,(int)($q['days']    ?? 30)));
        if (!validMonthYear($month)) {
            return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido'], 400);
        }

        // Gating de historial: usuarios free solo pueden consultar los últimos
        // limits.history_months meses. Si month_year es anterior al límite → 403.
        if ($err = enforceHistoryLimit($conn, $uid, $month, null)) {
            return jsonResponse($response, $err, 403);
        }

        // ---- summary ----
        $stmt = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense,
                COUNT(*) AS total_transactions
            FROM transactions
            WHERE user_id = :u AND DATE_FORMAT(transaction_date, '%Y-%m') = :m
        ");
        $stmt->execute([':u'=>$uid, ':m'=>$month]);
        $sumRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['total_income'=>0,'total_expense'=>0,'total_transactions'=>0];
        $totalIncome  = (float)($sumRow['total_income']  ?? 0);
        $totalExpense = (float)($sumRow['total_expense'] ?? 0);
        $balance      = $totalIncome - $totalExpense;
        $savingsRatio = $totalIncome > 0 ? round(($balance / $totalIncome) * 100, 2) : 0;

        // net_total_historical (modelo dual):
        // = SUM(surplus de cierres pasados) + transacciones scope='historical'
        // NO incluye el periodo actual (aún en curso; se cerraría al mes siguiente).
        // closeFinancialPeriods ya se ejecutó en requireAuth, así que
        // monthly_closures tiene los datos más recientes posibles.
        $periodStart = currentPeriodStart($conn, $uid);
        $periodEnd   = nextPeriodStart($periodStart, getUserPayday($conn, $uid)); // exclusivo

        // En la misma pasada: "Mis ahorros" y el "Saldo del mes" del periodo en curso
        // (solo scope='month', del día de cobro al siguiente). El total del mes
        // natural de arriba sigue alimentando los gráficos.
        $hist = $conn->prepare("
            SELECT
                COALESCE((SELECT SUM(mc.surplus) FROM monthly_closures mc WHERE mc.user_id = :u), 0)
              + " . HISTORICAL_TX_SQL . "
                AS net_total,
              COALESCE(SUM(CASE WHEN t.type='income'  AND t.scope='month'
                                 AND t.transaction_date >= :ps1 AND t.transaction_date < :pe1 THEN t.amount ELSE 0 END), 0)
                AS period_income,
              COALESCE(SUM(CASE WHEN t.type='expense' AND t.scope='month'
                                 AND t.transaction_date >= :ps2 AND t.transaction_date < :pe2 THEN t.amount ELSE 0 END), 0)
                AS period_expense
            FROM transactions t
            WHERE t.user_id = :u2
        ");
        $hist->execute([':u'=>$uid, ':u2'=>$uid, ':ps1'=>$periodStart, ':pe1'=>$periodEnd, ':ps2'=>$periodStart, ':pe2'=>$periodEnd]);
        $histRow       = $hist->fetch(PDO::FETCH_ASSOC) ?: [];
        $netTotal      = (float)($histRow['net_total'] ?? 0);
        $periodIncome  = (float)($histRow['period_income'] ?? 0);
        $periodExpense = (float)($histRow['period_expense'] ?? 0);

        $g = $conn->prepare("SELECT COALESCE(SUM(current_amount),0) AS saved FROM savings_goals WHERE user_id = :u");
        $g->execute([':u'=>$uid]);
        $totalSaved = (float)($g->fetch(PDO::FETCH_ASSOC)['saved'] ?? 0);

        $rec = $conn->prepare("
            SELECT type, frequency, amount FROM recurring_expenses
            WHERE user_id = :u AND is_active = 1
        ");
        $rec->execute([':u'=>$uid]);
        $rExp = 0.0; $rInc = 0.0;
        foreach ($rec->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $eq = monthlyEquivalent((float)$r['amount'], (string)$r['frequency']);
            if ($r['type'] === 'income') $rInc += $eq; else $rExp += $eq;
        }

        $prev = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense
            FROM transactions
            WHERE user_id = :u AND DATE_FORMAT(transaction_date, '%Y-%m') =
                DATE_FORMAT(DATE_SUB(STR_TO_DATE(CONCAT(:m,'-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m')
        ");
        $prev->execute([':u'=>$uid, ':m'=>$month]);
        $prevRow = $prev->fetch(PDO::FETCH_ASSOC) ?: ['total_income'=>0,'total_expense'=>0];

        $sv = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='expense' THEN amount ELSE -amount END) AS net_saved
            FROM transactions
            WHERE user_id = :u
              AND goal_id IS NOT NULL
              AND DATE_FORMAT(transaction_date, '%Y-%m') = :m
        ");
        $sv->execute([':u'=>$uid, ':m'=>$month]);
        $savedThisMonth = (float)($sv->fetch(PDO::FETCH_ASSOC)['net_saved'] ?? 0);

        $summary = [
            'month_year'           => $month,
            'total_income'         => round($totalIncome, 2),
            'total_expense'        => round($totalExpense, 2),
            'balance'              => round($balance, 2),
            'savings_ratio'        => $savingsRatio,
            'total_transactions'   => (int)($sumRow['total_transactions'] ?? 0),
            'net_total_historical' => round($netTotal, 2),
            'total_saved_in_goals' => round($totalSaved, 2),
            'recurring_monthly'    => [
                'expense' => round($rExp, 2),
                'income'  => round($rInc, 2),
                'net'     => round($rInc - $rExp, 2)
            ],
            'previous' => [
                'total_income'  => round((float)$prevRow['total_income'], 2),
                'total_expense' => round((float)$prevRow['total_expense'], 2),
            ],
            'saved_this_month'     => round($savedThisMonth, 2),
            // Periodo financiero en curso (del día de cobro al siguiente, exclusivo).
            'current_period_start' => $periodStart,
            'next_period_start'    => $periodEnd,
            // "Saldo del mes" del modelo dual: solo scope='month' dentro del periodo.
            // total_income/total_expense/balance siguen siendo del mes natural (gráficos).
            'period_income'        => round($periodIncome, 2),
            'period_expense'       => round($periodExpense, 2),
            'period_balance'       => round($periodIncome - $periodExpense, 2),
        ];

        // ---- monthly ----
        $st = $conn->prepare("
            SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month_year,
                   SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
            FROM transactions
            WHERE user_id = :u
              AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL :m MONTH)
            GROUP BY month_year ORDER BY month_year ASC
        ");
        $st->bindValue(':u', $uid, PDO::PARAM_INT);
        $st->bindValue(':m', $months - 1, PDO::PARAM_INT);
        $st->execute();
        $monthly = $st->fetchAll(PDO::FETCH_ASSOC);

        // ---- categories (mes seleccionado) ----
        $st = $conn->prepare("
            SELECT t.category_id,
                   COALESCE(c.name, 'Sin categoría') AS category_name,
                   COALESCE(c.color, '#6B7280') AS category_color,
                   c.icon AS category_icon,
                   t.type, SUM(t.amount) AS total, COUNT(*) AS count
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = :u AND DATE_FORMAT(t.transaction_date, '%Y-%m') = :m
            GROUP BY t.category_id, t.type, c.name, c.color, c.icon
            ORDER BY total DESC
        ");
        $st->execute([':u'=>$uid, ':m'=>$month]);
        $categories = $st->fetchAll(PDO::FETCH_ASSOC);

        // ---- category-comparison ----
        $st = $conn->prepare("
            SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') AS month_year,
                   t.category_id,
                   COALESCE(c.name, 'Sin categoría') AS category_name,
                   COALESCE(c.color, '#6B7280') AS category_color,
                   SUM(t.amount) AS total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = :u AND t.type = 'expense'
              AND t.transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL :m MONTH)
            GROUP BY month_year, t.category_id, c.name, c.color
            ORDER BY month_year ASC, total DESC
        ");
        $st->bindValue(':u', $uid, PDO::PARAM_INT);
        $st->bindValue(':m', $months - 1, PDO::PARAM_INT);
        $st->execute();
        $comparison = $st->fetchAll(PDO::FETCH_ASSOC);

        // ---- payment methods ----
        $st = $conn->prepare("
            SELECT COALESCE(payment_method, 'other') AS payment_method,
                   SUM(amount) AS total, COUNT(*) AS count
            FROM transactions
            WHERE user_id = :u AND type = 'expense'
              AND DATE_FORMAT(transaction_date, '%Y-%m') = :m
            GROUP BY payment_method
            ORDER BY total DESC
        ");
        $st->execute([':u'=>$uid, ':m'=>$month]);
        $paymentMethods = $st->fetchAll(PDO::FETCH_ASSOC);

        // ---- trends ----
        $st = $conn->prepare("
            SELECT transaction_date,
                   SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
            FROM transactions
            WHERE user_id = :u AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL :d DAY)
            GROUP BY transaction_date ORDER BY transaction_date ASC
        ");
        $st->bindValue(':u', $uid, PDO::PARAM_INT);
        $st->bindValue(':d', $days - 1, PDO::PARAM_INT);
        $st->execute();
        $trends = $st->fetchAll(PDO::FETCH_ASSOC);

        // ---- daily (gasto/ingreso por día del mes seleccionado) ----
        // Sirve para el calendario heatmap y el desglose semanal del cliente.
        $st = $conn->prepare("
            SELECT t.transaction_date,
                   DAY(t.transaction_date) AS day,
                   SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END) AS expense,
                   SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END) AS income
            FROM transactions t
            WHERE t.user_id = :u AND DATE_FORMAT(t.transaction_date, '%Y-%m') = :m
            GROUP BY t.transaction_date
            ORDER BY t.transaction_date ASC
        ");
        $st->execute([':u'=>$uid, ':m'=>$month]);
        $daily = $st->fetchAll(PDO::FETCH_ASSOC);

        // ---- projection ----
        $st = $conn->prepare("
            SELECT AVG(monthly_income) AS avg_income, AVG(monthly_expense) AS avg_expense
            FROM (
                SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS m,
                       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS monthly_income,
                       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS monthly_expense
                FROM transactions
                WHERE user_id = :u
                  AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 3 MONTH)
                GROUP BY m
            ) AS sub
        ");
        $st->execute([':u'=>$uid]);
        $pr = $st->fetch(PDO::FETCH_ASSOC) ?: ['avg_income'=>0,'avg_expense'=>0];
        $avgIncome  = (float)($pr['avg_income']  ?? 0);
        $avgExpense = (float)($pr['avg_expense'] ?? 0);
        // Sin double-counting: los recurrentes ya están dentro de los avg.
        $monthlyNet = $avgIncome - $avgExpense;

        $projection = [
            'avg_monthly_income'    => round($avgIncome, 2),
            'avg_monthly_expense'   => round($avgExpense, 2),
            'recurring_monthly_in'  => round($rInc, 2),
            'recurring_monthly_out' => round($rExp, 2),
            'projected_monthly_net' => round($monthlyNet, 2),
            'projected_6_months'    => round($monthlyNet * 6, 2),
            'projected_12_months'   => round($monthlyNet * 12, 2),
        ];

        // ---- savings_goal_stats (additivo en summary) ----
        // +1 query al monthly_closures del usuario + savings_goal_monthly del usuario
        // (ya cargado vía getUserPayday() → evitamos re-query a users si el cache está;
        //  pero savings_goal_monthly no está en ese cache, así que una sola SELECT lo trae).
        $savingsGoalStats = null;
        try {
            // Leer savings_goal_monthly del usuario (1 query, comparte conexión PDO).
            $sgStmt = $conn->prepare(
                "SELECT savings_goal_monthly FROM users WHERE id = :u LIMIT 1"
            );
            $sgStmt->execute([':u' => $uid]);
            $sgRow = $sgStmt->fetch(PDO::FETCH_ASSOC);
            $goalMonthly = $sgRow && $sgRow['savings_goal_monthly'] !== null
                           ? (float)$sgRow['savings_goal_monthly']
                           : null;

            // Traer todos los cierres del usuario ordenados ASC (1 query).
            $clStmt = $conn->prepare(
                "SELECT period_start, surplus FROM monthly_closures
                 WHERE user_id = :u ORDER BY period_start ASC"
            );
            $clStmt->execute([':u' => $uid]);
            $closures = $clStmt->fetchAll(PDO::FETCH_ASSOC);

            $totalCierres = count($closures);

            if ($totalCierres === 0) {
                // Sin cierres → numéricos null, serie vacía.
                $savingsGoalStats = [
                    'goal'               => $goalMonthly,
                    'months_met'         => null,
                    'months_exceeded'    => null,
                    'current_streak'     => null,
                    'best_streak'        => null,
                    'total_saved'        => null,
                    'avg_monthly_surplus'=> null,
                    'pct_months_met'     => null,
                    'series'             => [],
                ];
            } else {
                // Calcular métricas en PHP sobre el array (sin round-trips extra).
                $goalPositive  = ($goalMonthly !== null && $goalMonthly > 0);
                $monthsMet      = 0;
                $monthsExceeded = 0;
                $totalSurplus   = 0.0;
                $series         = [];

                foreach ($closures as $cl) {
                    $surplus = (float)$cl['surplus'];
                    $totalSurplus += $surplus;
                    $met = $goalPositive ? ($surplus >= $goalMonthly) : null;
                    if ($goalPositive && $surplus >= $goalMonthly) $monthsMet++;
                    if ($goalPositive && $surplus > $goalMonthly)  $monthsExceeded++;
                    $series[] = [
                        'period_start' => $cl['period_start'],
                        'surplus'      => round($surplus, 2),
                        'goal'         => $goalMonthly,
                        'met'          => $met,
                    ];
                }

                $avgSurplus = round($totalSurplus / $totalCierres, 2);

                // Racha actual: recorrer la serie en orden INVERSO y contar
                // meses consecutivos donde met=true (se detiene al primer false/null).
                $currentStreak = null;
                $bestStreak    = null;
                if ($goalPositive) {
                    $streak = 0;
                    for ($i = $totalCierres - 1; $i >= 0; $i--) {
                        if ($series[$i]['met'] === true) {
                            $streak++;
                        } else {
                            break;
                        }
                    }
                    $currentStreak = $streak;

                    // Mejor racha: recorrer en orden ASC.
                    $best   = 0;
                    $run    = 0;
                    foreach ($series as $s) {
                        if ($s['met'] === true) {
                            $run++;
                            if ($run > $best) $best = $run;
                        } else {
                            $run = 0;
                        }
                    }
                    $bestStreak = $best;
                }

                $pctMet = $goalPositive
                    ? round(($monthsMet / $totalCierres) * 100, 2)
                    : null;

                $savingsGoalStats = [
                    'goal'               => $goalMonthly,
                    'months_met'         => $goalPositive ? $monthsMet      : null,
                    'months_exceeded'    => $goalPositive ? $monthsExceeded : null,
                    'current_streak'     => $currentStreak,
                    'best_streak'        => $bestStreak,
                    'total_saved'        => round($totalSurplus, 2),
                    'avg_monthly_surplus'=> $avgSurplus,
                    'pct_months_met'     => $pctMet,
                    'series'             => $series,
                ];
            }
        } catch (Throwable $sgErr) {
            // No debe tumbar la request si falla; loguear y devolver null.
            error_log('[analytics/all savings_goal_stats] ' . $sgErr->getMessage());
            $savingsGoalStats = null;
        }

        // Inyectar savings_goal_stats dentro de summary (additivo, retrocompatible).
        $summary['savings_goal_stats'] = $savingsGoalStats;

        return jsonResponse($response, [
            'summary'             => $summary,
            'monthly'             => $monthly,
            'categories'          => $categories,
            'category_comparison' => $comparison,
            'payment_methods'     => $paymentMethods,
            'trends'              => $trends,
            'projection'          => $projection,
            'daily'               => $daily,
        ]);
    });

    $group->get('/analytics/trends', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $days = max(1, min(180, (int)($request->getQueryParams()['days'] ?? 30)));

        $stmt = $conn->prepare("
            SELECT transaction_date,
                   SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
            FROM transactions
            WHERE user_id = :u
              AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL :d DAY)
            GROUP BY transaction_date
            ORDER BY transaction_date ASC
        ");
        $stmt->bindValue(':u', (int)$jwt['user_id'], PDO::PARAM_INT);
        $stmt->bindValue(':d', $days - 1, PDO::PARAM_INT);
        $stmt->execute();
        return jsonResponse($response, ['trends' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    });

    $group->get('/analytics/projection', function (Request $request, Response $response) use ($conn) {
        $jwt = $request->getAttribute('user');
        $uid = (int)$jwt['user_id'];

        $stmt = $conn->prepare("
            SELECT
                AVG(monthly_income)  AS avg_income,
                AVG(monthly_expense) AS avg_expense
            FROM (
                SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS m,
                       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS monthly_income,
                       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS monthly_expense
                FROM transactions
                WHERE user_id = :u
                  AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 3 MONTH)
                GROUP BY m
            ) AS sub
        ");
        $stmt->execute([':u'=>$uid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['avg_income'=>0,'avg_expense'=>0];
        $avgIncome  = (float)($row['avg_income']  ?? 0);
        $avgExpense = (float)($row['avg_expense'] ?? 0);

        $rec = $conn->prepare("
            SELECT type, frequency, amount FROM recurring_expenses
            WHERE user_id = :u AND is_active = 1
        ");
        $rec->execute([':u'=>$uid]);
        $rExp = 0.0; $rInc = 0.0;
        foreach ($rec->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $eq = monthlyEquivalent((float)$r['amount'], (string)$r['frequency']);
            if ($r['type'] === 'income') $rInc += $eq; else $rExp += $eq;
        }

        // Importante: los gastos/ingresos recurrentes activos YA están
        // materializados como transacciones (expandRecurringTransactions),
        // por lo que ya pesan dentro de avgIncome/avgExpense. Sumarlos
        // de nuevo aquí los contaría DOS veces.
        $monthlyNet = $avgIncome - $avgExpense;

        return jsonResponse($response, [
            'avg_monthly_income'    => round($avgIncome, 2),
            'avg_monthly_expense'   => round($avgExpense, 2),
            'recurring_monthly_in'  => round($rInc, 2),
            'recurring_monthly_out' => round($rExp, 2),
            'projected_monthly_net' => round($monthlyNet, 2),
            'projected_6_months'    => round($monthlyNet * 6, 2),
            'projected_12_months'   => round($monthlyNet * 12, 2),
        ]);
    });

    // ------ USO DE LA APP (monitoreo anónimo y agregado) ------
    // Solo día, evento, plataforma y contadores: ningún dato personal.
    $group->post('/usage', function (Request $request, Response $response) use ($conn) {
        $data = $request->getParsedBody() ?? [];
        $invalid = fn(string $m): Response => jsonResponse($response, ['error' => true, 'message' => $m], 400);

        $day   = (string)($data['day'] ?? '');
        $dt    = DateTimeImmutable::createFromFormat('!Y-m-d', $day);
        $today = new DateTimeImmutable('today');
        if (!$dt || $dt->format('Y-m-d') !== $day || $dt < $today->modify('-8 days') || $dt > $today->modify('+1 day')) {
            return $invalid('Día no válido');
        }
        $platform = (string)($data['platform'] ?? '');
        if (!in_array($platform, ['ios', 'android', 'web'], true)) return $invalid('Plataforma no válida');

        $events = $data['events'] ?? null;
        if (!is_array($events) || !$events || count($events) > 60) return $invalid('Eventos no válidos');
        $first = $data['first_today'] ?? [];
        if (!is_array($first) || count($first) > 60) return $invalid('first_today no válido');
        $isFirst = [];
        foreach ($first as $name) {
            if (is_string($name)) $isFirst[strtolower($name)] = true;
        }

        $counts = [];
        foreach ($events as $name => $count) {
            if (!is_string($name) || !preg_match('/^[A-Za-z0-9_.:-]{1,64}$/', $name)) return $invalid('Nombre de evento no válido');
            if (!is_int($count) || $count < 1 || $count > 500) return $invalid('Cuenta no válida');
            // Una sola fila por evento aunque llegue con otra capitalización.
            $name = strtolower($name);
            $counts[$name] = ($counts[$name] ?? 0) + $count;
        }

        // Los nombres los elige el cliente: con un tope de filas por día, una cuenta
        // no puede llenar la tabla inventándolos. Superado, solo suman los que ya
        // existen ese día (lo normal son unas pocas decenas por plataforma).
        $st = $conn->prepare("SELECT COUNT(*) FROM usage_daily WHERE day = ?");
        $st->execute([$day]);
        if ((int)$st->fetchColumn() >= USAGE_MAX_ROWS_PER_DAY) {
            $names = array_map('strval', array_keys($counts));
            $st = $conn->prepare("
                SELECT event FROM usage_daily
                WHERE day = ? AND platform = ? AND event IN (" . implode(', ', array_fill(0, count($names), '?')) . ")
            ");
            $st->execute(array_merge([$day, $platform], $names));
            $known = array_flip(array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN)));
            $counts = array_filter($counts, fn($name): bool => isset($known[(string)$name]), ARRAY_FILTER_USE_KEY);
            if (!$counts) return jsonResponse($response, ['success' => true]);
        }

        $rows = [];
        $params = [];
        foreach ($counts as $name => $count) {
            $rows[] = '(?, ?, ?, ?, ?)';
            array_push($params, $day, (string)$name, $platform, $count, isset($isFirst[(string)$name]) ? 1 : 0);
        }
        $conn->prepare("
            INSERT INTO usage_daily (day, event, platform, events, users)
            VALUES " . implode(', ', $rows) . "
            ON DUPLICATE KEY UPDATE events = events + VALUES(events), users = users + VALUES(users)
        ")->execute($params);

        return jsonResponse($response, ['success' => true]);
    });

    // ------ ADMINISTRACIÓN (ADMIN_EMAILS) ------
    $group->get('/admin/usage', function (Request $request, Response $response) use ($conn) {
        if (!adminUser($conn, $request)) {
            return jsonResponse($response, ['error' => true, 'message' => 'No autorizado'], 403);
        }
        $days = (int)($request->getQueryParams()['days'] ?? 30);
        if (!in_array($days, [7, 30, 90], true)) $days = 30;
        $to   = new DateTimeImmutable('today');
        $from = $to->modify('-' . ($days - 1) . ' days');
        $range = [':f' => $from->format('Y-m-d'), ':t' => $to->format('Y-m-d')];

        $st = $conn->prepare("
            SELECT event, SUM(events) AS events, SUM(users) AS users
            FROM usage_daily WHERE day BETWEEN :f AND :t
            GROUP BY event ORDER BY events DESC LIMIT 200
        ");
        $st->execute($range);
        $totals = array_map(fn(array $r): array => [
            'event' => (string)$r['event'], 'events' => (int)$r['events'], 'users' => (int)$r['users'],
        ], $st->fetchAll(PDO::FETCH_ASSOC));

        $st = $conn->prepare("
            SELECT platform, SUM(events) AS events FROM usage_daily
            WHERE day BETWEEN :f AND :t GROUP BY platform ORDER BY events DESC
        ");
        $st->execute($range);
        $byPlatform = array_map(fn(array $r): array => [
            'platform' => (string)$r['platform'], 'events' => (int)$r['events'],
        ], $st->fetchAll(PDO::FETCH_ASSOC));

        $st = $conn->prepare("
            SELECT day, SUM(events) AS events, SUM(users) AS users FROM usage_daily
            WHERE event = 'app_open' AND day BETWEEN :f AND :t GROUP BY day
        ");
        $st->execute($range);
        $byDay = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byDay[(string)$r['day']] = $r;
        $daily = [];
        for ($d = $from; $d <= $to; $d = $d->modify('+1 day')) {
            $k = $d->format('Y-m-d');
            $daily[] = ['day' => $k, 'events' => (int)($byDay[$k]['events'] ?? 0), 'users' => (int)($byDay[$k]['users'] ?? 0)];
        }

        $st = $conn->prepare("
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(created_at >= :f), 0) AS new_users,
                   COALESCE(SUM(email_verified_at IS NOT NULL), 0) AS verified
            FROM users
        ");
        $st->execute([':f' => $range[':f']]);
        $u = $st->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'new_users' => 0, 'verified' => 0];
        $usersTotal = (int)$u['total'];

        $st = $conn->prepare("SELECT COUNT(DISTINCT user_id) FROM transactions WHERE created_at >= :f");
        $st->execute([':f' => $range[':f']]);
        $usersActive = (int)$st->fetchColumn();

        // Plan efectivo de cada usuario (el de mayor rango entre sus filas vigentes).
        $st = $conn->query("
            SELECT best, COUNT(*) AS users FROM (
                SELECT e.user_id,
                       MAX(CASE p.code WHEN 'pro_freelance' THEN 4 WHEN 'family' THEN 3 WHEN 'plus' THEN 2 ELSE 1 END) AS best
                FROM user_entitlements e
                JOIN plans p ON p.id = COALESCE(e.plan_id, (SELECT p2.id FROM plans p2 WHERE p2.code = e.plan_code LIMIT 1))
                WHERE e.is_active = 1 AND (e.expires_at IS NULL OR e.expires_at >= CURDATE())
                GROUP BY e.user_id
            ) x GROUP BY best
        ");
        $rankToCode = [2 => 'plus', 3 => 'family', 4 => 'pro_freelance'];
        $paid = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $code = $rankToCode[(int)$r['best']] ?? null;
            if ($code) $paid[$code] = (int)$r['users'];
        }
        $plans = [['plan_code' => 'free', 'users' => max(0, $usersTotal - array_sum($paid))]];
        foreach ($rankToCode as $code) {
            $plans[] = ['plan_code' => $code, 'users' => $paid[$code] ?? 0];
        }

        return jsonResponse($response, [
            'days' => $days,
            'from' => $range[':f'],
            'to'   => $range[':t'],
            'overview' => [
                'users_total'  => $usersTotal,
                'users_new'    => (int)$u['new_users'],
                'users_active' => $usersActive,
                'verified_pct' => $usersTotal > 0 ? round((int)$u['verified'] * 100 / $usersTotal, 1) : 0,
                'plans'        => $plans,
            ],
            'totals'      => $totals,
            'by_platform' => $byPlatform,
            'daily'       => $daily,
        ]);
    });

    // Diagnóstico del correo en producción: envío inmediato (devuelve el error
    // SMTP) y otro por la vía diferida que usan los códigos (queda en el log).
    $group->post('/admin/mail-test', function (Request $request, Response $response) use ($conn) {
        $admin = adminUser($conn, $request);
        if (!$admin) {
            return jsonResponse($response, ['error' => true, 'message' => 'No autorizado'], 403);
        }
        $email = (string)$admin['email'];
        if (!checkAuthRateLimit($conn, $request, 'mail_test', $email, 5, 15)) {
            return rateLimitedResponse($response);
        }
        recordAuthFailure($conn, $request, 'mail_test', $email);

        $config = [];
        foreach (['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as $key) {
            $config[$key] = appConfig($key) !== '';
        }
        $config['openssl'] = extension_loaded('openssl');
        $config['litespeed_finish_request'] = function_exists('litespeed_finish_request');
        $config['fastcgi_finish_request'] = function_exists('fastcgi_finish_request');

        $mailer = Mailer::fromConfig();
        if ($mailer === null) {
            AppLog::error('mail', 'prueba: SMTP sin configurar');
            return jsonResponse($response, [
                'success' => false, 'to' => $email, 'config' => $config,
                'message' => 'Faltan claves SMTP o SMTP_FROM no es una dirección válida.',
            ]);
        }
        try {
            $body = emailBody((string)$admin['name'], 'Si lees esto, el servidor envía correos correctamente (envío inmediato).', null, 'Enviado desde el panel de uso de ChillPocket.');
            $mailer->send($email, 'Prueba de correo de ChillPocket (inmediato)', $body['text'], $body['html']);
            AppLog::info('mail', 'prueba inmediata enviada', ['para' => AppLog::maskEmail($email)]);
        } catch (Throwable $e) {
            AppLog::error('mail', 'prueba inmediata fallida: ' . $e->getMessage());
            return jsonResponse($response, ['success' => false, 'to' => $email, 'message' => $e->getMessage(), 'config' => $config]);
        }
        sendMailAfterResponse($email, 'Prueba de correo de ChillPocket (diferido)', emailBody(
            (string)$admin['name'],
            'Este correo usa la misma vía que los códigos de verificación y de contraseña.',
            null,
            'Si te llega el inmediato pero no este, el problema está en el envío diferido: revisa el log.'
        ));
        return jsonResponse($response, [
            'success' => true, 'to' => $email, 'config' => $config,
            'message' => 'Enviado. En unos segundos llegará un segundo correo por la vía diferida (la de los códigos).',
        ]);
    });

    // ------ DIVISAS ------
    $group->get('/currency/rate', function (Request $request, Response $response) use ($conn) {
        $to = $request->getQueryParams()['to'] ?? '';
        $to = strtoupper(trim(is_string($to) ? $to : ''));
        if (!in_array($to, SUPPORTED_CURRENCIES, true)) {
            return jsonResponse($response, ['error' => true, 'message' => 'Moneda no soportada'], 400);
        }
        $me   = fetchUser($conn, (int)$request->getAttribute('user')['user_id']);
        $from = strtoupper((string)($me['currency'] ?? 'EUR'));
        if (!preg_match('/^[A-Z]{3}$/', $from)) $from = 'EUR';
        $rate = exchangeRate($conn, $from, $to);
        if ($rate === null) {
            return jsonResponse($response, ['error' => true, 'message' => 'No se pudo obtener el cambio. Inténtalo más tarde.'], 502);
        }
        return jsonResponse($response, [
            'from' => $from, 'to' => $to, 'rate' => $rate['rate'], 'date' => $rate['date'], 'source' => EXCHANGE_RATE_SOURCE,
        ]);
    });

    // Cambia la moneda de la cuenta convirtiendo TODOS sus importes con el cambio
    // actual. El cliente manda el cambio que ha enseñado al usuario: si ya no es
    // ese, 409 y se vuelve a confirmar.
    $group->post('/me/currency', function (Request $request, Response $response) use ($conn) {
        $uid  = (int)$request->getAttribute('user')['user_id'];
        $data = $request->getParsedBody() ?? [];
        $to   = strtoupper(trim(is_string($data['currency'] ?? null) ? $data['currency'] : ''));
        $shownRate = $data['rate'] ?? null;
        if (!in_array($to, SUPPORTED_CURRENCIES, true)) {
            return jsonResponse($response, ['error' => true, 'message' => 'Moneda no soportada'], 400);
        }
        if (!is_numeric($shownRate) || (float)$shownRate <= 0) {
            return jsonResponse($response, ['error' => true, 'message' => 'Cambio no válido'], 400);
        }

        $me = fetchUser($conn, $uid);
        if (!$me) return jsonResponse($response, ['error' => true, 'message' => 'Usuario no existe'], 404);
        $from = strtoupper((string)$me['currency']);
        $zero = ['transactions' => 0, 'recurring' => 0, 'budgets' => 0, 'goals' => 0];
        if ($from === $to) {
            return jsonResponse($response, ['success' => true, 'user' => attachEntitlement($conn, $me), 'rate' => 1, 'converted' => $zero]);
        }

        $email = strtolower((string)$me['email']);
        // Tope por cuenta, no por IP: la IP la comparten NAT/CGNAT y X-Forwarded-For
        // se falsifica (otro podría agotar el cupo de un usuario con su IP).
        if (!checkEmailDailyLimit($conn, 'currency', $email, 5)) {
            AppLog::warning('currency', 'tope diario de conversiones alcanzado', ['u' => $uid]);
            return rateLimitedResponse($response, 1440);
        }

        $rate = exchangeRate($conn, $from, $to);
        if ($rate === null) {
            return jsonResponse($response, ['error' => true, 'message' => 'No se pudo obtener el cambio. Inténtalo más tarde.'], 502);
        }
        if (abs($rate['rate'] - (float)$shownRate) > $rate['rate'] * 0.000001) {
            return jsonResponse($response, [
                'error' => true, 'code' => 'rate_changed', 'rate' => $rate['rate'], 'date' => $rate['date'],
                'message' => 'El cambio se ha actualizado. Revísalo y confirma de nuevo.',
            ], 409);
        }
        // Texto en notación decimal (nunca "1.0E-5") y CAST en SQL: un texto sin CAST
        // se opera en DOUBLE y ROUND redondea al par (1,01 × 0,5 → 0,50 en vez de 0,51).
        $k = rtrim(rtrim(number_format((float)$rate['rate'], 8, '.', ''), '0'), '.');
        $kSql = 'CAST(:k AS DECIMAL(18,8))';

        try {
            $conn->beginTransaction();
            $lock = $conn->prepare("SELECT currency FROM users WHERE id = :u FOR UPDATE");
            $lock->execute([':u' => $uid]);
            if (strtoupper((string)$lock->fetchColumn()) !== $from) {
                $conn->rollBack();
                return jsonResponse($response, ['error' => true, 'code' => 'currency_changed', 'message' => 'La moneda ya ha cambiado. Recarga e inténtalo de nuevo.'], 409);
            }

            $run = function (string $sql) use ($conn, $uid, $k): int {
                $st = $conn->prepare($sql);
                $st->execute([':k' => $k, ':u' => $uid]);
                return $st->rowCount();
            };
            $converted = [
                'transactions' => $run("UPDATE transactions SET amount = ROUND(amount * $kSql, 2) WHERE user_id = :u"),
                'recurring'    => $run("UPDATE recurring_expenses SET amount = ROUND(amount * $kSql, 2) WHERE user_id = :u"),
                'budgets'      => $run("UPDATE budgets SET amount = ROUND(amount * $kSql, 2) WHERE user_id = :u"),
                'goals'        => 0,
            ];
            // El objetivo tiene CHECK (> 0): uno diminuto no puede quedarse en 0,00.
            $goals = $conn->prepare("
                UPDATE savings_goals
                SET target_amount = GREATEST(0.01, ROUND(target_amount * CAST(:k1 AS DECIMAL(18,8)), 2)),
                    current_amount = ROUND(current_amount * CAST(:k2 AS DECIMAL(18,8)), 2)
                WHERE user_id = :u
            ");
            $goals->execute([':k1' => $k, ':k2' => $k, ':u' => $uid]);
            $converted['goals'] = $goals->rowCount();

            $conn->prepare("
                UPDATE users
                SET currency = :c,
                    income_reference = ROUND(income_reference * CAST(:k1 AS DECIMAL(18,8)), 2),
                    savings_goal_monthly = ROUND(savings_goal_monthly * CAST(:k2 AS DECIMAL(18,8)), 2)
                WHERE id = :u
            ")->execute([':c' => $to, ':k1' => $k, ':k2' => $k, ':u' => $uid]);

            // Los cierres son sumas de transacciones: se recalculan con los importes nuevos.
            $conn->prepare("DELETE FROM monthly_closures WHERE user_id = :u")->execute([':u' => $uid]);
            closeFinancialPeriods($conn, $uid);

            $conn->prepare("
                INSERT INTO currency_conversions (user_id, from_currency, to_currency, rate, rate_date, transactions)
                VALUES (:u, :f, :t, :k, :d, :n)
            ")->execute([':u' => $uid, ':f' => $from, ':t' => $to, ':k' => $k, ':d' => $rate['date'], ':n' => $converted['transactions']]);

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            AppLog::error('currency', "conversión {$from}→{$to} fallida: " . $e->getMessage());
            $tooBig = stripos($e->getMessage(), 'out of range') !== false || (string)$e->getCode() === '22003';
            return jsonResponse($response, [
                'error' => true,
                'message' => $tooBig
                    ? 'Algún importe sería demasiado grande en la nueva moneda. No se ha cambiado nada.'
                    : 'No se pudo convertir la moneda. No se ha cambiado nada.',
            ], 500);
        }
        recordAuthFailure($conn, $request, 'currency', $email); // cuenta para el límite diario
        AppLog::info('currency', "conversión {$from}→{$to}", ['u' => $uid, 'rate' => $k] + $converted);

        return jsonResponse($response, [
            'success' => true,
            'user' => attachEntitlement($conn, fetchUser($conn, $uid)),
            'rate' => $rate['rate'],
            'converted' => $converted,
        ]);
    });

})->add(requireAuth($conn));

// =====================================================
// BILLING · Webhook RevenueCat (pública — NO bajo requireAuth)
// =====================================================
// RC envía eventos de compra/renovación/expiración a este endpoint.
// La autenticación es un secreto compartido en el header Authorization,
// definido en Conexion.php como define('REVENUECAT_WEBHOOK_AUTH', '...');
// (nunca en el repo). Ver instrucciones de deploy.
//
// Contrato: devuelve 200 siempre que pase auth+parse. Nunca 5xx por
// fallo de procesamiento (RC reintentaría). Errores → error_log + 200.
$app->post('/billing/webhook/revenuecat', function (Request $request, Response $response) use ($conn) {

    // ── 1) AUTENTICACIÓN ──────────────────────────────────────────────
    // El secreto se lee de la constante definida en Conexion.php (no versionado)
    // o de la variable de entorno. Si no está configurado, 503 fail-closed.
    $expected = '';
    if (defined('REVENUECAT_WEBHOOK_AUTH')) {
        $expected = (string) REVENUECAT_WEBHOOK_AUTH;
    }
    if ($expected === '') {
        $expected = (string) getenv('REVENUECAT_WEBHOOK_AUTH');
    }
    if ($expected === '') {
        error_log('[rc_webhook] REVENUECAT_WEBHOOK_AUTH no configurado en servidor');
        return jsonResponse($response, ['ok' => false, 'reason' => 'webhook_not_configured'], 503);
    }

    $auth = trim($request->getHeaderLine('Authorization'));
    // hash_equals evita timing attacks al comparar secretos.
    if (!hash_equals($expected, $auth)) {
        error_log('[rc_webhook] auth mismatch — header recibido no coincide con el secreto configurado');
        return jsonResponse($response, ['ok' => false], 401);
    }

    // ── 2) PARSEO DEL BODY ───────────────────────────────────────────
    $rawBody = (string)$request->getBody();
    $data    = json_decode($rawBody, true);
    if (!is_array($data)) {
        error_log('[rc_webhook] body no es JSON válido: ' . substr($rawBody, 0, 200));
        return jsonResponse($response, ['ok' => false, 'reason' => 'invalid_json'], 400);
    }

    $event = $data['event'] ?? null;
    if (!is_array($event) || !isset($event['id'])) {
        error_log('[rc_webhook] body sin event.id: ' . substr($rawBody, 0, 200));
        return jsonResponse($response, ['ok' => false, 'reason' => 'missing_event_id'], 400);
    }

    $eventId  = (string)$event['id'];
    $type     = (string)($event['type'] ?? 'UNKNOWN');
    $appUserId = (string)($event['app_user_id'] ?? '');
    $productId = (string)($event['product_id'] ?? '');

    // ── 3) IDEMPOTENCIA: INSERT en billing_events ────────────────────
    // La UNIQUE KEY (provider, external_id) garantiza que si RC reenvía el
    // mismo evento, el INSERT falla con duplicate-key (SQLSTATE 23000) y
    // devolvemos 200 sin volver a procesar. Atómico: ahorra un SELECT previo.
    try {
        // Resolvemos user_id para billing_events (puede ser NULL para eventos TEST).
        $billingUserId = null;
        if (is_numeric($appUserId) && (int)$appUserId > 0) {
            $billingUserId = (int)$appUserId;
        }

        $insEvent = $conn->prepare("
            INSERT INTO billing_events (provider, event_type, external_id, user_id, payload_json)
            VALUES ('revenuecat', :type, :eid, :uid, :raw)
        ");
        $insEvent->execute([
            ':type' => $type,
            ':eid'  => $eventId,
            ':uid'  => $billingUserId,
            ':raw'  => $rawBody,
        ]);
    } catch (PDOException $e) {
        // SQLSTATE 23000 = Integrity constraint violation (duplicate key).
        if ($e->getCode() === '23000') {
            error_log('[rc_webhook] evento duplicado ignorado: ' . $eventId);
            return jsonResponse($response, ['ok' => true, 'duplicate' => true]);
        }
        // Otro error de BD: loguear y 200 (RC no debe reintentar por un bug nuestro).
        error_log('[rc_webhook] error al insertar billing_event: ' . $e->getMessage());
        return jsonResponse($response, ['ok' => true, 'reason' => 'db_error_logged']);
    }

    // ── 4) RESOLVER USUARIO ──────────────────────────────────────────
    // app_user_id == 'RCBillingTest' o no numérico → evento de prueba, no-op.
    if ($appUserId === 'RCBillingTest' || !is_numeric($appUserId) || (int)$appUserId <= 0) {
        error_log('[rc_webhook] evento TEST o app_user_id no numérico (' . $appUserId . ') — no-op');
        return jsonResponse($response, ['ok' => true, 'test' => true]);
    }
    $userId = (int)$appUserId;

    // Verificar que el usuario existe en nuestra BD.
    $chkUser = $conn->prepare("SELECT id FROM users WHERE id = :id LIMIT 1");
    $chkUser->execute([':id' => $userId]);
    if (!$chkUser->fetchColumn()) {
        error_log('[rc_webhook] usuario no encontrado: ' . $userId . ' (evento ' . $type . ')');
        return jsonResponse($response, ['ok' => true, 'reason' => 'user_not_found']);
    }

    error_log('[rc_webhook] recibido type=' . $type . ' user=' . $userId . ' product=' . $productId);

    // ── 5) DISPATCH POR TIPO DE EVENTO ───────────────────────────────
    // $subscriptionId: identificador que persiste entre renewals.
    // RC usa original_transaction_id (más estable) y transaction_id.
    $subscriptionId = (string)($event['original_transaction_id'] ?? $event['transaction_id'] ?? $eventId);

    // Fecha de expiración: NULL para lifetime/one-time.
    $expiresAt = null;
    if (isset($event['expiration_at_ms']) && $event['expiration_at_ms'] !== null && $event['expiration_at_ms'] !== 0) {
        $expiresAt = gmdate('Y-m-d', (int)($event['expiration_at_ms'] / 1000));
    }

    try {
        switch ($type) {

            // ── Activar/renovar suscripción ──────────────────────────
            case 'INITIAL_PURCHASE':
            case 'RENEWAL':
            case 'PRODUCT_CHANGE': {
                $planCode = rcProductToPlanCode($productId);
                if ($planCode === null) {
                    error_log('[rc_webhook] product_id desconocido: ' . $productId . ' — no-op');
                    break;
                }
                $source = 'revenuecat';

                // Marcar las filas activas previas DEL MISMO TIPO (revenuecat / stripe) como inactivas
                // para que getUserEntitlements() no vea dos planes activos simultáneos.
                // OJO: NO tocamos filas con source='early_adopter' ni 'manual' — son grants
                // permanentes que sobreviven al ciclo de billing (early adopters, comps internos).
                // Si el usuario tiene early_adopter y compra Plus, conviven: getUserEntitlements()
                // gana al de mayor rango y, si expira la compra, el early_adopter sigue activo.
                $conn->prepare("UPDATE user_entitlements SET is_active = 0 WHERE user_id = :u AND is_active = 1 AND source NOT IN ('early_adopter', 'manual')")
                     ->execute([':u' => $userId]);

                // Buscar si ya existe una fila para este external_subscription_id
                // (re-activación, PRODUCT_CHANGE, etc.).
                $chkSub = $conn->prepare("SELECT id FROM user_entitlements WHERE user_id = :u AND external_subscription_id = :sub LIMIT 1");
                $chkSub->execute([':u' => $userId, ':sub' => $subscriptionId]);
                $existingId = $chkSub->fetchColumn();

                if ($existingId) {
                    $conn->prepare("UPDATE user_entitlements SET is_active = 1, plan_code = :p, plan_id = (SELECT id FROM plans WHERE code = :pc), source = :s, expires_at = :exp WHERE id = :id")
                         ->execute([':p' => $planCode, ':pc' => $planCode, ':s' => $source, ':exp' => $expiresAt, ':id' => $existingId]);
                } else {
                    $conn->prepare("INSERT INTO user_entitlements (user_id, plan_code, plan_id, is_active, source, expires_at, external_subscription_id) VALUES (:u, :p, (SELECT id FROM plans WHERE code = :pc), 1, :s, :exp, :sub)")
                         ->execute([':u' => $userId, ':p' => $planCode, ':pc' => $planCode, ':s' => $source, ':exp' => $expiresAt, ':sub' => $subscriptionId]);
                }

                error_log('[rc_webhook] activado plan=' . $planCode . ' source=' . $source . ' expires=' . ($expiresAt ?? 'NULL') . ' sub=' . $subscriptionId);
                break;
            }

            // ── El usuario revierte la cancelación antes de expirar ──
            case 'UNCANCELLATION': {
                // La suscripción vuelve a estar activa. Reactivamos la fila.
                $stmt = $conn->prepare("UPDATE user_entitlements SET is_active = 1 WHERE user_id = :u AND external_subscription_id = :sub");
                $stmt->execute([':u' => $userId, ':sub' => $subscriptionId]);
                if ($stmt->rowCount() === 0) {
                    // Caso raro: el usuario ya no tenía una fila para esta subscripción
                    // (compra previa al despliegue del webhook, p.ej.). Quedará en free
                    // hasta el próximo RENEWAL. Log para que el operador lo vea.
                    error_log('[rc_webhook] UNCANCELLATION sin filas afectadas — usuario user=' . $userId . ' sub=' . $subscriptionId . ' (¿compra previa al webhook?)');
                } else {
                    error_log('[rc_webhook] UNCANCELLATION — fila reactivada sub=' . $subscriptionId);
                }
                break;
            }

            // ── Cancelación: el usuario sigue con Plus hasta expires_at ─
            case 'CANCELLATION': {
                // NO desactivamos — el usuario tiene Plus hasta que expire.
                // EXPIRATION lo desactivará en su momento.
                error_log('[rc_webhook] CANCELLATION recibida — sin cambios (expires_at intacto) sub=' . $subscriptionId);
                break;
            }

            // ── La suscripción ha expirado definitivamente ────────────
            case 'EXPIRATION': {
                $conn->prepare("UPDATE user_entitlements SET is_active = 0 WHERE user_id = :u AND external_subscription_id = :sub")
                     ->execute([':u' => $userId, ':sub' => $subscriptionId]);
                error_log('[rc_webhook] EXPIRATION — plan desactivado sub=' . $subscriptionId);
                break;
            }

            // ── Problema de cobro (grace period activo) ───────────────
            case 'BILLING_ISSUE': {
                // No desactivamos: RC da un grace period y enviará EXPIRATION si no se resuelve.
                error_log('[rc_webhook] BILLING_ISSUE recibida — sin cambios (grace period) sub=' . $subscriptionId);
                break;
            }

            // ── Suscripción pausada (solo Play Store) ────────────────
            case 'SUBSCRIPTION_PAUSED': {
                $conn->prepare("UPDATE user_entitlements SET is_active = 0 WHERE user_id = :u AND external_subscription_id = :sub")
                     ->execute([':u' => $userId, ':sub' => $subscriptionId]);
                error_log('[rc_webhook] SUBSCRIPTION_PAUSED — plan desactivado sub=' . $subscriptionId);
                break;
            }

            // ── Reembolso: devolución → revocar acceso ────────────────
            case 'REFUND': {
                $conn->prepare("UPDATE user_entitlements SET is_active = 0 WHERE user_id = :u AND external_subscription_id = :sub")
                     ->execute([':u' => $userId, ':sub' => $subscriptionId]);
                error_log('[rc_webhook] REFUND — plan desactivado sub=' . $subscriptionId);
                break;
            }

            // ── Compra única (Lifetime Plus) ──────────────────────────
            case 'NON_RENEWING_PURCHASE': {
                $planCode = rcProductToPlanCode($productId);
                if ($planCode === null) {
                    error_log('[rc_webhook] NON_RENEWING_PURCHASE con product_id desconocido: ' . $productId . ' — no-op');
                    break;
                }
                // Lifetime: expires_at = NULL, source = 'lifetime'.
                $source = ($productId === 'lifetime_plus') ? 'lifetime' : 'revenuecat';
                $ltExpires = ($source === 'lifetime') ? null : $expiresAt;

                // Para lifetime: el external_subscription_id usamos event.id porque
                // las compras únicas no tienen original_transaction_id persistente igual
                // que las suscripciones en todos los stores.
                $ltSubId = ($source === 'lifetime') ? $eventId : $subscriptionId;

                // Marcar previas inactivas EXCEPTO early_adopter/manual (grants permanentes).
                $conn->prepare("UPDATE user_entitlements SET is_active = 0 WHERE user_id = :u AND is_active = 1 AND source NOT IN ('early_adopter', 'manual')")
                     ->execute([':u' => $userId]);

                $chkSub2 = $conn->prepare("SELECT id FROM user_entitlements WHERE user_id = :u AND external_subscription_id = :sub LIMIT 1");
                $chkSub2->execute([':u' => $userId, ':sub' => $ltSubId]);
                $existingId2 = $chkSub2->fetchColumn();

                if ($existingId2) {
                    $conn->prepare("UPDATE user_entitlements SET is_active = 1, plan_code = :p, plan_id = (SELECT id FROM plans WHERE code = :pc), source = :s, expires_at = :exp WHERE id = :id")
                         ->execute([':p' => $planCode, ':pc' => $planCode, ':s' => $source, ':exp' => $ltExpires, ':id' => $existingId2]);
                } else {
                    $conn->prepare("INSERT INTO user_entitlements (user_id, plan_code, plan_id, is_active, source, expires_at, external_subscription_id) VALUES (:u, :p, (SELECT id FROM plans WHERE code = :pc), 1, :s, :exp, :sub)")
                         ->execute([':u' => $userId, ':p' => $planCode, ':pc' => $planCode, ':s' => $source, ':exp' => $ltExpires, ':sub' => $ltSubId]);
                }

                error_log('[rc_webhook] NON_RENEWING_PURCHASE activado plan=' . $planCode . ' source=' . $source . ' sub=' . $ltSubId);
                break;
            }

            // ── Evento de test de RC al configurar el webhook ─────────
            case 'TEST': {
                error_log('[rc_webhook] TEST event recibido — no-op (webhook configurado correctamente)');
                break;
            }

            // ── Cualquier tipo nuevo que RC añada en el futuro ────────
            default: {
                error_log('[rc_webhook] type no manejado: ' . $type . ' — no-op');
                break;
            }
        }
    } catch (Throwable $e) {
        // Error de procesamiento: loguear pero devolver 200 para que RC no reintente
        // indefinidamente. El operador revisará error_log.
        error_log('[rc_webhook] error de procesamiento type=' . $type . ' user=' . $userId . ': ' . $e->getMessage());
    }

    return jsonResponse($response, ['ok' => true]);
});

$app->run();
