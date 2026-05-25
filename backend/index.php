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
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

require __DIR__ . "/vendor/autoload.php";
require __DIR__ . "/Conexion.php";

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

// ================= DB =================
$conn = Conexion::getPDO();
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

function fetchUser(PDO $conn, int $userId): ?array {
    $stmt = $conn->prepare("
        SELECT id, name, email, currency, timezone, avatar_url, theme, created_at
        FROM users WHERE id = :id LIMIT 1
    ");
    $stmt->execute([':id' => $userId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
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

// =====================================================
// BILLING · entitlements del usuario
// =====================================================
// Devuelve el plan activo del usuario (o 'free') con sus límites y features.
// Si no hay fila activa en user_entitlements → 'free'. Si hay varias activas,
// se queda con la de mayor "rango" (pro_freelance > family > plus > free).
function getUserEntitlements(PDO $conn, int $userId): array {
    $stmt = $conn->prepare("
        SELECT e.plan_code, e.source, e.expires_at
        FROM user_entitlements e
        WHERE e.user_id = :u
          AND e.is_active = 1
          AND (e.expires_at IS NULL OR e.expires_at >= CURDATE())
        ORDER BY
          CASE e.plan_code
            WHEN 'pro_freelance' THEN 4
            WHEN 'family'        THEN 3
            WHEN 'plus'          THEN 2
            ELSE 1
          END DESC
        LIMIT 1
    ");
    $stmt->execute([':u' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $planCode = $row['plan_code'] ?? 'free';

    $p = $conn->prepare("SELECT name, limits_json, features_json FROM plans WHERE code = :c LIMIT 1");
    $p->execute([':c' => $planCode]);
    $plan = $p->fetch(PDO::FETCH_ASSOC);

    $limits   = $plan ? (json_decode((string)$plan['limits_json'],   true) ?: []) : [];
    $features = $plan ? (json_decode((string)$plan['features_json'], true) ?: []) : [];

    return [
        'plan_code'      => $planCode,
        'plan_name'      => $plan['name'] ?? 'Gratis',
        'plan_source'    => $row['source'] ?? null,
        'plan_expires_at'=> $row['expires_at'] ?? null,
        'limits'         => $limits,
        'features'       => $features,
        'is_premium'     => $planCode !== 'free',
        'is_web_allowed' => (bool)($features['web_access'] ?? false),
    ];
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
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $res = curl_exec($ch);
        curl_close($ch);
        return $res === false ? null : $res;
    }
    $res = @file_get_contents($url);
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
function savingsCategoryId(PDO $conn): int {
    $stmt = $conn->prepare("
        SELECT id FROM categories
        WHERE user_id IS NULL AND name = 'Ahorro' AND type = 'expense'
        LIMIT 1
    ");
    $stmt->execute();
    $id = $stmt->fetchColumn();
    if ($id) return (int)$id;
    $ins = $conn->prepare("
        INSERT INTO categories (user_id, name, color, icon, type)
        VALUES (NULL, 'Ahorro', '#10B981', 'savings', 'expense')
    ");
    $ins->execute();
    return (int)$conn->lastInsertId();
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
               (SELECT MAX(t.transaction_date) FROM transactions t
                 WHERE t.recurring_id = r.id AND t.user_id = r.user_id) AS last_date
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

    foreach ($rows as $r) {
        $start = DateTimeImmutable::createFromFormat('Y-m-d', (string)$r['start_date']);
        if (!$start) continue;
        $endLimit = $r['end_date']
            ? DateTimeImmutable::createFromFormat('Y-m-d', (string)$r['end_date'])
            : null;
        if ($endLimit && $endLimit < $today) continue;
        $upTo = $endLimit && $endLimit < $today ? $endLimit : $today;

        // Punto desde donde empezar a generar: día siguiente a last_date,
        // o el propio start_date si nunca se generó nada.
        if ($r['last_date']) {
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
            $cursor = nextRecurringDate($cursor, (string)$r['frequency'], $start);
            $i++;
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

// ================= MIDDLEWARE =================
function requireAuth(PDO $conn): callable {
    return function (Request $request, RequestHandlerInterface $handler) use ($conn) {
        $user = authenticate($request);
        if (!$user) {
            $response = new \Slim\Psr7\Response();
            return jsonResponse($response, ['error'=>true,'message'=>'Token inválido o no proporcionado'], 401);
        }
        // Expansión lazy: para cualquier petición autenticada generamos las
        // transacciones recurrentes que toquen. Es idempotente gracias al
        // INDEX UNIQUE (user_id, recurring_id, transaction_date).
        try { expandRecurringTransactions($conn, (int)$user['user_id']); } catch (Throwable $e) { /* silencioso */ }
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
            'POST /transactions              {amount,description,type,transaction_date,category_id?,payment_method?,notes?}',
            'PUT  /transactions/{id}',
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
            'POST /savings-goals/{id}/contribute  {amount}',
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
        ]
    ]);
});

// ================= AUTH =================
$app->post('/auth/register', function (Request $request, Response $response) use ($conn) {
    $data = $request->getParsedBody() ?? [];
    foreach (['name','email','password'] as $f) {
        if (empty($data[$f])) return jsonResponse($response, ['error'=>true,'message'=>"Falta campo: $f"], 400);
    }
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        return jsonResponse($response, ['error'=>true,'message'=>'Email inválido'], 400);
    }
    if (strlen((string)$data['password']) < 6) {
        return jsonResponse($response, ['error'=>true,'message'=>'La contraseña debe tener al menos 6 caracteres'], 400);
    }

    $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email");
    $stmt->execute([':email' => $data['email']]);
    if ($stmt->fetch()) return jsonResponse($response, ['error'=>true,'message'=>'Email ya registrado'], 409);

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

        $conn->commit();

        $user = fetchUser($conn, $userId);
        $user = attachEntitlement($conn, $user);

        return jsonResponse($response, [
            'success' => true,
            'token'   => tokenForUser($user),
            'user'    => $user
        ], 201);
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        error_log('[auth/register] ' . $e->getMessage());
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
    if ($idToken === '') {
        return jsonResponse($response, ['error'=>true,'message'=>'Falta id_token'], 400);
    }

    $check = verifyGoogleIdToken($idToken);
    if (!$check['ok']) {
        return jsonResponse($response, ['error'=>true,'message'=>'Google: '.$check['reason']], 401);
    }
    $payload = $check['payload'];
    $email = trim((string)($payload['email'] ?? ''));
    $sub   = trim((string)($payload['sub']   ?? ''));
    if ($email === '' || $sub === '') {
        return jsonResponse($response, ['error'=>true,'message'=>'Token sin email/sub'], 401);
    }
    // Exigir email verificado ANTES de enlazar/crear cuenta por email. Sin esto,
    // un id_token con un email no verificado podría enlazarse a una cuenta ajena
    // (toma de cuentas). Google entrega el flag como bool o string.
    $emailVerified = $payload['email_verified'] ?? false;
    if ($emailVerified !== true && $emailVerified !== 'true') {
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
            $stmt = $conn->prepare("SELECT id FROM users WHERE email = :e LIMIT 1");
            $stmt->execute([':e'=>$email]);
            $userId = $stmt->fetchColumn();
            if ($userId) {
                // Enlazamos el google_sub a la cuenta ya existente
                $upd = $conn->prepare("UPDATE users SET google_sub = :s WHERE id = :id");
                $upd->execute([':s'=>$sub, ':id'=>$userId]);
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
        }

        $conn->commit();
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        return jsonResponse($response, ['error'=>true,'message'=>'No se pudo iniciar sesión con Google'], 500);
    }

    $user = fetchUser($conn, (int)$userId);
    if (!$user) {
        return jsonResponse($response, ['error'=>true,'message'=>'Usuario no encontrado'], 500);
    }

    // Aprovechamos para regenerar transacciones recurrentes pendientes
    try { expandRecurringTransactions($conn, (int)$user['id']); } catch (Throwable $e) {}

    $user = attachEntitlement($conn, $user);

    return jsonResponse($response, [
        'success' => true,
        'token'   => tokenForUser($user),
        'user'    => $user,
        'is_new'  => $isNew,
    ]);
});

$app->post('/auth/login', function (Request $request, Response $response) use ($conn) {
    $data = $request->getParsedBody() ?? [];
    if (empty($data['email']) || empty($data['password'])) {
        return jsonResponse($response, ['error'=>true,'message'=>'Email y password son obligatorios'], 400);
    }
    $stmt = $conn->prepare("SELECT * FROM users WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $data['email']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !password_verify((string)$data['password'], (string)$row['password_hash'])) {
        return jsonResponse($response, ['error'=>true,'message'=>'Credenciales inválidas'], 401);
    }

    $user = fetchUser($conn, (int)$row['id']);
    // Generar transacciones pendientes inmediatamente al iniciar sesión
    try { expandRecurringTransactions($conn, (int)$user['id']); } catch (Throwable $e) {}

    $user = attachEntitlement($conn, $user);

    return jsonResponse($response, [
        'success' => true,
        'token'   => tokenForUser($user),
        'user'    => $user
    ]);
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

        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);

        $stmt = $conn->prepare("UPDATE users SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);

        return jsonResponse($response, ['success'=>true, 'user' => attachEntitlement($conn, fetchUser($conn, (int)$jwt['user_id']))]);
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
        $stmt = $conn->prepare("SELECT password_hash FROM users WHERE id = :id");
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
        $q   = $request->getQueryParams();

        $sql = "
            SELECT t.id, t.amount, t.description, t.type, t.transaction_date, t.notes,
                   t.payment_method, t.recurring_id, t.goal_id,
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

        if ($description === '') return jsonResponse($response, ['error'=>true,'message'=>'Descripción obligatoria'], 400);
        if (!is_finite($amount) || $amount <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        if (!in_array($type, ['expense','income'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
        }
        if (!validDate($date)) return jsonResponse($response, ['error'=>true,'message'=>'Fecha inválida (YYYY-MM-DD)'], 400);
        if (!validPaymentMethod($paymentMethod)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo de pago inválido'], 400);
        }

        if ($categoryId !== null) {
            if (!userCanUseCategory($conn, (int)$jwt['user_id'], $categoryId)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
            }
        }

        $stmt = $conn->prepare("
            INSERT INTO transactions (user_id, category_id, amount, description, type, transaction_date, notes, payment_method)
            VALUES (:u, :c, :a, :d, :t, :td, :n, :pm)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$categoryId, ':a'=>$amount,
            ':d'=>$description, ':t'=>$type, ':td'=>$date, ':n'=>$notes ?: null,
            ':pm'=>$paymentMethod ?: null
        ]);
        $id = (int)$conn->lastInsertId();

        $sel = $conn->prepare("
            SELECT t.id, t.amount, t.description, t.type, t.transaction_date, t.notes,
                   t.payment_method, t.recurring_id, t.goal_id,
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
        $check = $conn->prepare("SELECT id FROM transactions WHERE id = :id AND user_id = :u");
        $check->execute([':id'=>$id, ':u'=>(int)$jwt['user_id']]);
        if (!$check->fetch()) return jsonResponse($response, ['error'=>true,'message'=>'Transacción no encontrada'], 404);

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

        if (!$fields) return jsonResponse($response, ['error'=>true,'message'=>'Sin datos para actualizar'], 400);

        $stmt = $conn->prepare("UPDATE transactions SET ".implode(', ', $fields)." WHERE id = :id");
        $stmt->execute($params);
        return jsonResponse($response, ['success'=>true]);
    });

    $group->delete('/transactions/{id}', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("DELETE FROM transactions WHERE id = :id AND user_id = :u");
        $stmt->execute([':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
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

        // Regenerar transacciones inmediatamente
        try { expandRecurringTransactions($conn, (int)$jwt['user_id']); } catch (Throwable $e) {}
        return jsonResponse($response, ['success'=>true,'id'=>(int)$conn->lastInsertId()], 201);
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

        $sel = $conn->prepare("SELECT name, current_amount, target_amount FROM savings_goals WHERE id = :id AND user_id = :u");
        $sel->execute([':id'=>$gid, ':u'=>$uid]);
        $goal = $sel->fetch(PDO::FETCH_ASSOC);
        if (!$goal) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);

        $current = (float)$goal['current_amount'];
        if ($amount > 0) {
            $available = availableBalance($conn, $uid);
            if ($amount > $available + 0.001) {
                return jsonResponse($response, [
                    'error'=>true,
                    'message'=>'Saldo insuficiente. Disponible: ' . number_format($available, 2)
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
                    (user_id, category_id, amount, description, type, transaction_date, notes, goal_id)
                VALUES (:u, :c, :a, :d, :t, CURDATE(), :n, :g)
            ");
            $insTx->execute([
                ':u'=>$uid, ':c'=>$catId, ':a'=>$txAmount,
                ':d'=>$txDescription, ':t'=>$txType,
                ':n'=>'Movimiento de meta de ahorro',
                ':g'=>$gid,
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
        $month = $request->getQueryParams()['month_year'] ?? date('Y-m');
        if (!validMonthYear($month)) {
            return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido (YYYY-MM)'], 400);
        }
        // El gasto se calcula a partir del reset_day del presupuesto:
        // ventana = [año-mes-reset_day, +1 mes). Si reset_day = 1 equivale al mes natural.
        $stmt = $conn->prepare("
            SELECT b.id, b.amount, b.month_year, b.reset_day, b.category_id,
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
        $stmt->execute([':u' => (int)$jwt['user_id'], ':m' => $month]);
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
        $resetDay = isset($data['reset_day']) ? (int)$data['reset_day'] : 1;
        if ($resetDay < 1 || $resetDay > 28) $resetDay = 1;

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
            INSERT INTO budgets (user_id, category_id, amount, month_year, reset_day)
            VALUES (:u, :c, :a, :m, :rd)
            ON DUPLICATE KEY UPDATE amount = VALUES(amount), reset_day = VALUES(reset_day)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$catId, ':a'=>$amount, ':m'=>$month, ':rd'=>$resetDay
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

})->add(requireAuth($conn));

// ================= ERRORS =================
// displayErrorDetails=false en producción: no exponer stack/SQL al cliente.
// (Los errores siguen registrándose en el log del servidor.)
$errorMiddleware = $app->addErrorMiddleware(false, true, true);

$errorMiddleware->setErrorHandler(\Slim\Exception\HttpNotFoundException::class,
    function (Request $request, Throwable $e, bool $d) use ($app) {
        $r = $app->getResponseFactory()->createResponse();
        $r->getBody()->write(json_encode(['error'=>true,'message'=>'Ruta no encontrada']));
        return $r->withHeader('Content-Type','application/json')
                 ->withHeader('Access-Control-Allow-Origin','*')
                 ->withHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
                 ->withHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
                 ->withStatus(404);
    });

$errorMiddleware->setErrorHandler(\Slim\Exception\HttpMethodNotAllowedException::class,
    function (Request $request, Throwable $e, bool $d) use ($app) {
        $r = $app->getResponseFactory()->createResponse();
        $r->getBody()->write(json_encode(['error'=>true,'message'=>'Método no permitido']));
        return $r->withHeader('Content-Type','application/json')
                 ->withHeader('Access-Control-Allow-Origin','*')
                 ->withHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
                 ->withHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
                 ->withStatus(405);
    });

$errorMiddleware->setDefaultErrorHandler(
    function (Request $request, Throwable $e, bool $d, bool $l, bool $ld) use ($app) {
        $r = $app->getResponseFactory()->createResponse();
        $r->getBody()->write(json_encode(['error'=>true,'message'=>$d ? $e->getMessage() : 'Error interno del servidor']));
        return $r->withHeader('Content-Type','application/json')
                 ->withHeader('Access-Control-Allow-Origin','*')
                 ->withHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
                 ->withHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
                 ->withStatus(500);
    });

$app->run();
