<?php

declare(strict_types=1);

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
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'cambia_este_secreto_en_produccion');
define('JWT_EXPIRATION', 3600);

$app = AppFactory::create();
$app->setBasePath('/API_Finanzas');
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();

// ================= CORS =================
$app->options('/{routes:.+}', function (Request $request, Response $response) {
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, X-Requested-With')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
});
$app->add(function (Request $request, RequestHandlerInterface $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, X-Requested-With')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
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

// Comprueba que una categoría es accesible por el usuario:
// pertenece al user_id o es global (user_id IS NULL).
function userCanUseCategory(PDO $conn, int $userId, int $categoryId): bool {
    $stmt = $conn->prepare("
        SELECT id FROM categories
        WHERE id = :id AND (user_id = :u OR user_id IS NULL)
        LIMIT 1
    ");
    $stmt->execute([':id'=>$categoryId, ':u'=>$userId]);
    return (bool)$stmt->fetch();
}

// Comprueba que una categoría es propiedad del usuario (no global).
// Solo las propias se pueden editar/eliminar.
function userOwnsCategory(PDO $conn, int $userId, int $categoryId): bool {
    $stmt = $conn->prepare("
        SELECT id FROM categories
        WHERE id = :id AND user_id = :u
        LIMIT 1
    ");
    $stmt->execute([':id'=>$categoryId, ':u'=>$userId]);
    return (bool)$stmt->fetch();
}

// Calcula el coste mensual proyectado de un gasto recurrente.
function monthlyEquivalent(float $amount, string $frequency): float {
    return match ($frequency) {
        'weekly'  => $amount * 4.345,
        'monthly' => $amount,
        'yearly'  => $amount / 12,
        default   => $amount
    };
}

// ================= MIDDLEWARE =================
function requireAuth(): callable {
    return function (Request $request, RequestHandlerInterface $handler) {
        $user = authenticate($request);
        if (!$user) {
            $response = new \Slim\Psr7\Response();
            return jsonResponse($response, ['error'=>true,'message'=>'Token inválido o no proporcionado'], 401);
        }
        return $handler->handle($request->withAttribute('user', $user));
    };
}

// ================= DOCS =================
$app->get('/', function (Request $request, Response $response) {
    return jsonResponse($response, [
        'success' => true,
        'name'    => 'Finanzas API · Gestión de gastos personales',
        'version' => '1.0.0',
        'endpoints' => [
            'POST /auth/register             {name,email,password,currency?}',
            'POST /auth/login                {email,password}',
            'GET  /me',
            'PUT  /me                        {name?,currency?,timezone?,theme?,avatar_url?}',
            'PUT  /me/password               {current_password,new_password}',
            'GET  /categories?type=',
            'POST /categories                 {name,type,color?,icon?}',
            'PUT  /categories/{id}',
            'DELETE /categories/{id}',
            'GET  /transactions?from=&to=&type=&category_id=&search=&limit=&offset=',
            'POST /transactions              {amount,description,type,transaction_date,category_id?,notes?}',
            'PUT  /transactions/{id}',
            'DELETE /transactions/{id}',
            'GET  /recurring',
            'POST /recurring                 {name,amount,frequency,start_date,type?,category_id?,end_date?,notes?}',
            'PUT  /recurring/{id}',
            'PATCH /recurring/{id}/toggle',
            'DELETE /recurring/{id}',
            'GET  /savings-goals',
            'POST /savings-goals             {name,target_amount,target_date?,description?,color?}',
            'PUT  /savings-goals/{id}',
            'POST /savings-goals/{id}/contribute  {amount}',
            'DELETE /savings-goals/{id}',
            'GET  /budgets?month_year=YYYY-MM',
            'POST /budgets                   {amount,month_year,category_id?}',
            'DELETE /budgets/{id}',
            'GET  /analytics/summary?month_year=YYYY-MM',
            'GET  /analytics/monthly?months=6',
            'GET  /analytics/categories?month_year=YYYY-MM',
            'GET  /analytics/trends?days=30',
            'GET  /analytics/projection',
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

        // Las categorías son globales (user_id NULL); ya no se siembran por usuario.

        $conn->commit();

        $user = fetchUser($conn, $userId);

        return jsonResponse($response, [
            'success' => true,
            'token'   => tokenForUser($user),
            'user'    => $user
        ], 201);
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        return jsonResponse($response, ['error'=>true,'message'=>'No se pudo crear: '.$e->getMessage()], 500);
    }
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

        return jsonResponse($response, ['success'=>true, 'user' => fetchUser($conn, (int)$jwt['user_id'])]);
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
    // Las categorías globales (user_id NULL) son compartidas y de solo lectura.
    // Cada user puede crear, editar y borrar las suyas propias.
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
        // Normalizar is_system a boolean
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
        // Bloquear nombres que ya existen (en globales o en las del propio user)
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
            // Diferenciar entre "no existe" y "no es tuya" (es global)
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
            // Comprobar conflicto contra globales y propias (excluyendo la actual)
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

        if ($description === '') return jsonResponse($response, ['error'=>true,'message'=>'Descripción obligatoria'], 400);
        if ($amount < 0)          return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        if (!in_array($type, ['expense','income'], true)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Tipo inválido'], 400);
        }
        if (!validDate($date)) return jsonResponse($response, ['error'=>true,'message'=>'Fecha inválida (YYYY-MM-DD)'], 400);

        if ($categoryId !== null) {
            if (!userCanUseCategory($conn, (int)$jwt['user_id'], $categoryId)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
            }
        }

        $stmt = $conn->prepare("
            INSERT INTO transactions (user_id, category_id, amount, description, type, transaction_date, notes)
            VALUES (:u, :c, :a, :d, :t, :td, :n)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$categoryId, ':a'=>$amount,
            ':d'=>$description, ':t'=>$type, ':td'=>$date, ':n'=>$notes ?: null
        ]);
        $id = (int)$conn->lastInsertId();

        $sel = $conn->prepare("
            SELECT t.id, t.amount, t.description, t.type, t.transaction_date, t.notes,
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
            if ($a < 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
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
        $data = $request->getParsedBody() ?? [];

        $name      = trim((string)($data['name'] ?? ''));
        $amount    = isset($data['amount']) ? (float)$data['amount'] : -1;
        $frequency = (string)($data['frequency'] ?? 'monthly');
        $type      = (string)($data['type'] ?? 'expense');
        $start     = trim((string)($data['start_date'] ?? ''));
        $end       = isset($data['end_date']) && $data['end_date'] !== '' ? trim((string)$data['end_date']) : null;
        $catId     = isset($data['category_id']) && $data['category_id'] !== '' ? (int)$data['category_id'] : null;
        $notes     = isset($data['notes']) ? trim((string)$data['notes']) : null;

        if ($name === '')   return jsonResponse($response, ['error'=>true,'message'=>'Nombre obligatorio'], 400);
        if ($amount < 0)    return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
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
            if ($a < 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
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

    $group->patch('/recurring/{id}/toggle', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt = $request->getAttribute('user');
        $stmt = $conn->prepare("
            UPDATE recurring_expenses SET is_active = 1 - is_active
            WHERE id = :id AND user_id = :u
        ");
        $stmt->execute([':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
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
        $stmt->execute([':u' => (int)$jwt['user_id']]);
        return jsonResponse($response, ['goals' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    });

    $group->post('/savings-goals', function (Request $request, Response $response) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $data = $request->getParsedBody() ?? [];
        $name   = trim((string)($data['name'] ?? ''));
        $target = isset($data['target_amount']) ? (float)$data['target_amount'] : 0;
        $current= isset($data['current_amount']) ? (float)$data['current_amount'] : 0;
        $date   = isset($data['target_date']) && $data['target_date'] !== '' ? (string)$data['target_date'] : null;
        $desc   = isset($data['description']) ? trim((string)$data['description']) : null;
        $color  = validHexColor($data['color'] ?? null, '#10B981');
        $icon   = isset($data['icon']) ? trim((string)$data['icon']) : null;

        if ($name === '') return jsonResponse($response, ['error'=>true,'message'=>'Nombre obligatorio'], 400);
        if ($target <= 0) return jsonResponse($response, ['error'=>true,'message'=>'Monto objetivo debe ser > 0'], 400);
        if ($current < 0) return jsonResponse($response, ['error'=>true,'message'=>'Monto actual inválido'], 400);
        if ($date !== null && !validDate($date)) {
            return jsonResponse($response, ['error'=>true,'message'=>'Fecha objetivo inválida'], 400);
        }

        $stmt = $conn->prepare("
            INSERT INTO savings_goals
                (user_id, name, target_amount, current_amount, target_date, description, color, icon, is_completed)
            VALUES (:u, :n, :t, :ca, :td, :d, :c, :i, :ic)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':n'=>$name, ':t'=>$target,
            ':ca'=>$current, ':td'=>$date, ':d'=>$desc ?: null,
            ':c'=>$color, ':i'=>$icon ?: null,
            ':ic'=>$current >= $target ? 1 : 0
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
        if (array_key_exists('current_amount', $data)) {
            $c = (float)$data['current_amount'];
            if ($c < 0) return jsonResponse($response, ['error'=>true,'message'=>'Monto inválido'], 400);
            $fields[] = 'current_amount = :ca'; $params[':ca'] = $c;
        }
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

    $group->post('/savings-goals/{id}/contribute', function (Request $request, Response $response, array $args) use ($conn) {
        $jwt  = $request->getAttribute('user');
        $data = $request->getParsedBody() ?? [];
        $amount = isset($data['amount']) ? (float)$data['amount'] : 0;
        if ($amount === 0.0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);

        $stmt = $conn->prepare("
            UPDATE savings_goals
            SET current_amount = GREATEST(0, current_amount + :a),
                is_completed = CASE WHEN current_amount + :a >= target_amount THEN 1 ELSE 0 END
            WHERE id = :id AND user_id = :u
        ");
        $stmt->execute([':a'=>$amount, ':id'=>(int)$args['id'], ':u'=>(int)$jwt['user_id']]);
        if ($stmt->rowCount() === 0) return jsonResponse($response, ['error'=>true,'message'=>'No existe'], 404);
        return jsonResponse($response, ['success'=>true]);
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
        $stmt = $conn->prepare("
            SELECT b.id, b.amount, b.month_year, b.category_id,
                   c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                   COALESCE((
                       SELECT SUM(t.amount) FROM transactions t
                       WHERE t.user_id = b.user_id
                         AND t.type = 'expense'
                         AND DATE_FORMAT(t.transaction_date, '%Y-%m') = b.month_year
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
        $data = $request->getParsedBody() ?? [];
        $amount = isset($data['amount']) ? (float)$data['amount'] : -1;
        $month  = (string)($data['month_year'] ?? '');
        $catId  = isset($data['category_id']) && $data['category_id'] !== '' ? (int)$data['category_id'] : null;

        if ($amount < 0) return jsonResponse($response, ['error'=>true,'message'=>'Importe inválido'], 400);
        if (!validMonthYear($month)) return jsonResponse($response, ['error'=>true,'message'=>'month_year inválido'], 400);

        if ($catId !== null) {
            if (!userCanUseCategory($conn, (int)$jwt['user_id'], $catId)) {
                return jsonResponse($response, ['error'=>true,'message'=>'Categoría no válida'], 400);
            }
        }

        $stmt = $conn->prepare("
            INSERT INTO budgets (user_id, category_id, amount, month_year)
            VALUES (:u, :c, :a, :m)
            ON DUPLICATE KEY UPDATE amount = VALUES(amount)
        ");
        $stmt->execute([
            ':u'=>(int)$jwt['user_id'], ':c'=>$catId, ':a'=>$amount, ':m'=>$month
        ]);
        return jsonResponse($response, ['success'=>true], 201);
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

        // Total acumulado histórico (saldo neto histórico)
        $hist = $conn->prepare("
            SELECT
                SUM(CASE WHEN type='income'  THEN amount ELSE 0 END)
              - SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS net_total
            FROM transactions WHERE user_id = :u
        ");
        $hist->execute([':u'=>$uid]);
        $netTotal = (float)($hist->fetch(PDO::FETCH_ASSOC)['net_total'] ?? 0);

        // Suma de progreso en metas de ahorro
        $g = $conn->prepare("SELECT COALESCE(SUM(current_amount),0) AS saved FROM savings_goals WHERE user_id = :u");
        $g->execute([':u'=>$uid]);
        $totalSaved = (float)($g->fetch(PDO::FETCH_ASSOC)['saved'] ?? 0);

        // Gastos fijos proyectados (mensuales activos)
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
        return jsonResponse($response, ['categories' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
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

        // Promedio gasto/ingreso últimos 3 meses
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

        // Gastos fijos proyectados
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

        $monthlyNet = ($avgIncome + $rInc) - ($avgExpense + $rExp);

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

})->add(requireAuth());

// ================= ERRORS =================
$errorMiddleware = $app->addErrorMiddleware(true, true, true);

$errorMiddleware->setErrorHandler(\Slim\Exception\HttpNotFoundException::class,
    function (Request $request, Throwable $e, bool $d) use ($app) {
        $r = $app->getResponseFactory()->createResponse();
        $r->getBody()->write(json_encode(['error'=>true,'message'=>'Ruta no encontrada']));
        return $r->withHeader('Content-Type','application/json')
                 ->withHeader('Access-Control-Allow-Origin','*')->withStatus(404);
    });

$errorMiddleware->setErrorHandler(\Slim\Exception\HttpMethodNotAllowedException::class,
    function (Request $request, Throwable $e, bool $d) use ($app) {
        $r = $app->getResponseFactory()->createResponse();
        $r->getBody()->write(json_encode(['error'=>true,'message'=>'Método no permitido']));
        return $r->withHeader('Content-Type','application/json')
                 ->withHeader('Access-Control-Allow-Origin','*')->withStatus(405);
    });

$errorMiddleware->setDefaultErrorHandler(
    function (Request $request, Throwable $e, bool $d, bool $l, bool $ld) use ($app) {
        $r = $app->getResponseFactory()->createResponse();
        $r->getBody()->write(json_encode(['error'=>true,'message'=>$d ? $e->getMessage() : 'Error interno del servidor']));
        return $r->withHeader('Content-Type','application/json')
                 ->withHeader('Access-Control-Allow-Origin','*')->withStatus(500);
    });

$app->run();
