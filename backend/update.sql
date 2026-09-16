-- =====================================================
-- ChillPocket API · update.sql (migraciones acumuladas §5–§14)
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- Probado en MariaDB 10.3+ / MySQL 8.0+.
-- =====================================================

START TRANSACTION;

-- 5.1) Catálogo de planes con sus límites y features (Phase 1: solo lectura;
-- el wiring real con Stripe / RevenueCat llega en Phase 2).
CREATE TABLE IF NOT EXISTS `plans` (
    `id`            INT(11)      NOT NULL AUTO_INCREMENT,
    `code`          VARCHAR(32)  NOT NULL,
    `name`          VARCHAR(64)  NOT NULL,
    `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
    `limits_json`   LONGTEXT     NOT NULL,
    `features_json` LONGTEXT     NOT NULL,
    `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_plan_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed idempotente (UNIQUE en code evita duplicados).
-- limits: null = ilimitado. history_months = profundidad visible.
INSERT IGNORE INTO `plans` (`code`, `name`, `limits_json`, `features_json`) VALUES
('free',          'Gratis',         '{"budgets":2,"goals":2,"recurring":3,"custom_categories":8,"history_months":3}',
                                    '{"advanced_analytics":false,"export":false,"web_access":false,"cloud_backup":false,"family_mode":false,"fiscal_reports":false}'),
('plus',          'Plus',           '{"budgets":null,"goals":null,"recurring":null,"custom_categories":null,"history_months":null}',
                                    '{"advanced_analytics":true,"export":true,"web_access":true,"cloud_backup":true,"family_mode":false,"fiscal_reports":false}'),
('family',        'Familia',        '{"budgets":null,"goals":null,"recurring":null,"custom_categories":null,"history_months":null,"family_members":5}',
                                    '{"advanced_analytics":true,"export":true,"web_access":true,"cloud_backup":true,"family_mode":true,"fiscal_reports":false}'),
('pro_freelance', 'Pro Freelance',  '{"budgets":null,"goals":null,"recurring":null,"custom_categories":null,"history_months":null}',
                                    '{"advanced_analytics":true,"export":true,"web_access":true,"cloud_backup":true,"family_mode":false,"fiscal_reports":true}');

-- 5.2) Entitlements por usuario. Una fila activa = plan activo del usuario.
-- Si no hay ninguna fila activa, se considera 'free'. `source` distingue origen:
-- 'early_adopter' | 'manual' | 'stripe' | 'revenuecat' | 'lifetime'.
CREATE TABLE IF NOT EXISTS `user_entitlements` (
    `id`                       INT(11)      NOT NULL AUTO_INCREMENT,
    `user_id`                  INT(11)      NOT NULL,
    `plan_code`                VARCHAR(32)  NOT NULL,
    `is_active`                TINYINT(1)   NOT NULL DEFAULT 1,
    `source`                   VARCHAR(32)  NOT NULL DEFAULT 'manual',
    `expires_at`               DATE         DEFAULT NULL,
    `external_subscription_id` VARCHAR(128) DEFAULT NULL,
    `created_at`               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_active` (`user_id`, `is_active`),
    CONSTRAINT `user_entitlements_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5.3) Auditoría de eventos de facturación (webhooks Stripe/RevenueCat en Phase 2)
CREATE TABLE IF NOT EXISTS `billing_events` (
    `id`           INT(11)      NOT NULL AUTO_INCREMENT,
    `provider`     VARCHAR(32)  NOT NULL,
    `event_type`   VARCHAR(64)  NOT NULL,
    `external_id`  VARCHAR(128) DEFAULT NULL,
    `user_id`      INT(11)      DEFAULT NULL,
    `payload_json` LONGTEXT     NOT NULL,
    `received_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_provider_type` (`provider`, `event_type`),
    KEY `idx_user` (`user_id`),
    UNIQUE KEY `uniq_external_event` (`provider`, `external_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5.4) Backfill "early adopter" (v1.5.0) — YA APLICADO en producción y retirado.
-- Daba Plus de por vida a los usuarios sin fila activa. Como este script se
-- re-ejecuta entero, también se lo regalaba a cualquier usuario registrado
-- después. Las filas base (plan gratis) se crean ahora en §11c y en el registro.

-- =====================================================
-- 6) RATE LIMITING en /auth/* (v1.6.0)
-- =====================================================
-- Cada fila representa un intento fallido reciente. Los buckets usan el patrón
-- "ip:<ip>" o "email:<email>" para acumular contadores por separado y bloquear
-- la cuenta si CUALQUIERA de los dos sobrepasa el umbral en la ventana.
CREATE TABLE IF NOT EXISTS `auth_attempts` (
    `id`           INT(11)      NOT NULL AUTO_INCREMENT,
    `bucket_key`   VARCHAR(128) NOT NULL,
    `endpoint`     VARCHAR(32)  NOT NULL,
    `attempted_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_bucket_endpoint_time` (`bucket_key`, `endpoint`, `attempted_at`),
    KEY `idx_cleanup` (`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 7) Límite de recurrentes del plan free: 1 → 3
-- Motivo: el tutorial crea Netflix + Salario (2 recurrentes) y con límite 1
-- chocaba de inmediato; con 3 el usuario tiene 1 hueco real tras el onboarding.
-- Idempotente: el WHERE con JSON_EXTRACT garantiza que solo actualiza si aún
-- está en 1, por lo que re-ejecutar el script no sobreescribe cambios manuales.
-- =====================================================
UPDATE `plans`
  SET `limits_json` = JSON_SET(`limits_json`, '$.recurring', 3)
  WHERE `code` = 'free'
    AND JSON_EXTRACT(`limits_json`, '$.recurring') = 1;

-- =====================================================
-- 8) Modelo dual "Saldo del mes / Mis ahorros" (Fase 2)
--
-- Tres bloques:
--   8a) Columna `scope` en transactions: distingue si una transacción
--       afecta al saldo del mes en curso o directamente a "Mis ahorros".
--   8b) Tabla `monthly_closures`: registro de cada cierre mensual con su
--       excedente (surplus). El motor closeFinancialPeriods() la puebla
--       de forma lazy en cada request autenticado.
--   8c) Tres nuevas columnas en `users`: ingreso de referencia, día de cobro
--       y objetivo mensual de ahorro. Recogidos en el onboarding.
-- =====================================================

-- 8a) scope en transactions --------------------------
-- DEFAULT 'month' → retrocompatible: todas las transacciones existentes
-- se consideran del periodo mensual, que es exactamente su semántica actual.
-- MariaDB 10.3+ soporta ADD COLUMN IF NOT EXISTS; el guard de
-- information_schema asegura idempotencia en versiones anteriores.
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'transactions'
      AND COLUMN_NAME  = 'scope'
);
SET @sql = IF(@col_exists = 0,
    "ALTER TABLE `transactions` ADD COLUMN `scope` ENUM('month','historical') NOT NULL DEFAULT 'month'",
    'SELECT 1'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- 8b) monthly_closures --------------------------------
-- Cada fila = un periodo financiero cerrado para un usuario.
-- surplus puede ser negativo (si gastó más de lo que ingresó ese mes).
-- UNIQUE (user_id, period_start) garantiza idempotencia al re-ejecutar
-- closeFinancialPeriods(); INSERT IGNORE no duplica cierres.
-- idx_user_period_end acelera la búsqueda de "último cierre" y el JOIN
-- en el cálculo de net_total_historical.
CREATE TABLE IF NOT EXISTS `monthly_closures` (
    `id`           INT          NOT NULL AUTO_INCREMENT,
    `user_id`      INT          NOT NULL,
    `period_start` DATE         NOT NULL,
    `period_end`   DATE         NOT NULL,
    `surplus`      DECIMAL(10,2) NOT NULL DEFAULT 0,
    `closed_at`    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_user_period`    (`user_id`, `period_start`),
    KEY           `idx_user_period_end` (`user_id`, `period_end`),
    CONSTRAINT `mc_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8c) Columnas de preferencias financieras en users ---
-- income_reference: importe mensual declarado (del onboarding o ajustes).
-- income_payday:    día del mes del cobro (1-31; NULL = variable / mes natural).
-- savings_goal_monthly: objetivo de ahorro mensual del usuario.
-- Todas nullable para no romper filas existentes; DEFAULT NULL implícito.

SET @col2 = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'income_reference'
);
SET @sql2 = IF(@col2 = 0,
    'ALTER TABLE `users` ADD COLUMN `income_reference` DECIMAL(10,2) NULL',
    'SELECT 1'
);
PREPARE _stmt FROM @sql2; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @col3 = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'income_payday'
);
SET @sql3 = IF(@col3 = 0,
    'ALTER TABLE `users` ADD COLUMN `income_payday` TINYINT NULL',
    'SELECT 1'
);
PREPARE _stmt FROM @sql3; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @col4 = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'savings_goal_monthly'
);
SET @sql4 = IF(@col4 = 0,
    'ALTER TABLE `users` ADD COLUMN `savings_goal_monthly` DECIMAL(10,2) NULL',
    'SELECT 1'
);
PREPARE _stmt FROM @sql4; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- =====================================================
-- 9) Auto-renovación de presupuestos (item 12 del ROADMAP)
--    Bandera por presupuesto: si auto_renew=1, al consultar
--    un mes sin ese presupuesto se clona desde el mes anterior.
--    NOTA: la idempotencia del INSERT IGNORE en autoRenewBudgets
--    funciona solo para presupuestos CON category_id. Para el
--    presupuesto global (category_id NULL) MySQL/MariaDB trata
--    cada NULL como distinto en el índice UNIQUE, por lo que
--    INSERT IGNORE podría duplicar. Ver riesgo documentado en
--    data-model.md §budgets.
-- =====================================================
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'budgets'
      AND COLUMN_NAME  = 'auto_renew'
);
SET @sql = IF(@col_exists = 0,
    "ALTER TABLE `budgets` ADD COLUMN `auto_renew` TINYINT(1) NOT NULL DEFAULT 0",
    'SELECT 1'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- =====================================================
-- 10) Recibos de transacciones + flag receipt_photos en planes
-- (Fase 1 — ReceiptsAndSavingsStats)
--
-- 10a) Columna receipt_path en transactions:
--      Ruta relativa al archivo de recibo, p.ej. "Images/42/abc123.jpg".
--      NULL = sin recibo. Solo se escribe/borra mediante el endpoint PHP
--      (nunca por el cliente directamente). VARCHAR(255) es suficiente para
--      "Images/{user_id}/{32hex}.jpg".
--
-- 10b) Features completas de cada plan, con receipt_photos en todos los de
--      pago (free = false). Ver el bloque 10b más abajo.
-- =====================================================

-- 10a) receipt_path en transactions ------------------
SET @col_rp = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'transactions'
      AND COLUMN_NAME  = 'receipt_path'
);
SET @sql_rp = IF(@col_rp = 0,
    "ALTER TABLE `transactions` ADD COLUMN `receipt_path` VARCHAR(255) NULL DEFAULT NULL",
    'SELECT 1'
);
PREPARE _stmt FROM @sql_rp; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- 10b) Features de cada plan (incluye receipt_photos) ---
-- La versión anterior usaba CAST('true' AS JSON), que MariaDB no admite: el
-- script se detenía aquí y Plus nunca recibía receipt_photos. Ahora se fija el
-- JSON completo de cada plan. Idempotente (siempre escribe el mismo valor).
-- Si cambias las features de un plan, hazlo aquí y vuelve a ejecutar.
UPDATE `plans` SET `features_json` = '{"advanced_analytics":false,"export":false,"web_access":false,"cloud_backup":false,"family_mode":false,"fiscal_reports":false,"receipt_photos":false}' WHERE `code` = 'free';
UPDATE `plans` SET `features_json` = '{"advanced_analytics":true,"export":true,"web_access":true,"cloud_backup":true,"family_mode":false,"fiscal_reports":false,"receipt_photos":true}' WHERE `code` = 'plus';
UPDATE `plans` SET `features_json` = '{"advanced_analytics":true,"export":true,"web_access":true,"cloud_backup":true,"family_mode":true,"fiscal_reports":false,"receipt_photos":true}' WHERE `code` = 'family';
UPDATE `plans` SET `features_json` = '{"advanced_analytics":true,"export":true,"web_access":true,"cloud_backup":true,"family_mode":false,"fiscal_reports":true,"receipt_photos":true}' WHERE `code` = 'pro_freelance';

-- =====================================================
-- 11) Plan editable por usuario (user_entitlements.plan_id)
--   11a) Columna plan_id → plans.id. Es la que manda. Para cambiar el plan de
--        un usuario a mano, edita plan_id en su fila base: source='manual' (o
--        'early_adopter' si es un early adopter, que no tiene fila manual):
--        1 = Gratis · 2 = Plus · 3 = Familia · 4 = Pro Freelance.
--        Comprueba antes los ids reales con: SELECT id, code FROM plans;
--        plan_code queda como copia informativa; el backend la corrige sola.
--   11b) Rellena plan_id en las filas existentes a partir de plan_code.
--   11c) Fila base (plan gratis, source='manual') para cada usuario que no
--        tenga fila base (manual o early_adopter). El backend la crea al
--        registrar. Los webhooks de pago nunca desactivan filas 'manual'.
-- =====================================================
SET @col_pid = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'user_entitlements'
      AND COLUMN_NAME  = 'plan_id'
);
SET @sql_pid = IF(@col_pid = 0,
    "ALTER TABLE `user_entitlements` ADD COLUMN `plan_id` INT(11) NULL DEFAULT NULL AFTER `plan_code`",
    'SELECT 1'
);
PREPARE _stmt FROM @sql_pid; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @fk_pid = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME        = 'user_entitlements'
      AND CONSTRAINT_NAME   = 'user_entitlements_plan_fk'
);
SET @sql_fk = IF(@fk_pid = 0,
    "ALTER TABLE `user_entitlements` ADD CONSTRAINT `user_entitlements_plan_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON UPDATE CASCADE",
    'SELECT 1'
);
PREPARE _stmt FROM @sql_fk; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

UPDATE `user_entitlements` e
JOIN `plans` p ON p.`code` = e.`plan_code`
SET e.`plan_id` = p.`id`
WHERE e.`plan_id` IS NULL;

INSERT INTO `user_entitlements` (`user_id`, `plan_code`, `plan_id`, `is_active`, `source`)
SELECT u.`id`, p.`code`, p.`id`, 1, 'manual'
FROM `users` u
JOIN `plans` p ON p.`code` = 'free'
WHERE NOT EXISTS (
    SELECT 1 FROM `user_entitlements` e
    WHERE e.`user_id` = u.`id` AND e.`source` IN ('manual', 'early_adopter')
);

-- =====================================================
-- 12) Verificación de email y recuperación de contraseña (SMTP)
--   12a) users.email_verified_at: NULL = sin verificar.
--   12b) email_codes: códigos de 6 dígitos de un solo uso. Solo se guarda su
--        HMAC, con caducidad y contador de intentos.
--   12c) Las cuentas de Google ya llegan con el email verificado por Google.
-- =====================================================
SET @col_ev = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND COLUMN_NAME  = 'email_verified_at'
);
SET @sql_ev = IF(@col_ev = 0,
    "ALTER TABLE `users` ADD COLUMN `email_verified_at` DATETIME NULL DEFAULT NULL",
    'SELECT 1'
);
PREPARE _stmt FROM @sql_ev; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

CREATE TABLE IF NOT EXISTS `email_codes` (
    `id`         INT(11)     NOT NULL AUTO_INCREMENT,
    `user_id`    INT(11)     NOT NULL,
    `purpose`    VARCHAR(32) NOT NULL,
    `code_hash`  CHAR(64)    NOT NULL,
    `attempts`   TINYINT(4)  NOT NULL DEFAULT 0,
    `expires_at` DATETIME    NOT NULL,
    `used_at`    DATETIME    DEFAULT NULL,
    `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_purpose` (`user_id`, `purpose`),
    CONSTRAINT `email_codes_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE `users`
SET `email_verified_at` = COALESCE(`created_at`, NOW())
WHERE `google_sub` IS NOT NULL
  AND `email_verified_at` IS NULL;

-- =====================================================
-- 13) Monitoreo de uso y divisas
--   13a) usage_daily: uso de la app anónimo y agregado (día, evento, plataforma
--        y contadores). Ningún dato personal.
--   13b) exchange_rates: caché compartida de tipos de cambio del BCE (12 h).
--   13c) currency_conversions: registro de cada cambio de moneda de una cuenta
--        (permite auditar o deshacer con el cambio inverso).
-- =====================================================
CREATE TABLE IF NOT EXISTS `usage_daily` (
    `day`      DATE         NOT NULL,
    `event`    VARCHAR(64)  NOT NULL,
    `platform` VARCHAR(10)  NOT NULL,
    `events`   INT UNSIGNED NOT NULL DEFAULT 0,
    `users`    INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`day`, `event`, `platform`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `exchange_rates` (
    `base`       CHAR(3)       NOT NULL,
    `quote`      CHAR(3)       NOT NULL,
    `rate`       DECIMAL(18,8) NOT NULL,
    `rate_date`  DATE          NOT NULL,
    `fetched_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`base`, `quote`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `currency_conversions` (
    `id`            INT(11)       NOT NULL AUTO_INCREMENT,
    `user_id`       INT(11)       NOT NULL,
    `from_currency` CHAR(3)       NOT NULL,
    `to_currency`   CHAR(3)       NOT NULL,
    `rate`          DECIMAL(18,8) NOT NULL,
    `rate_date`     DATE          NOT NULL,
    `transactions`  INT(11)       NOT NULL DEFAULT 0,
    `converted_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user` (`user_id`),
    CONSTRAINT `currency_conversions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14) Cuenta de ahorro y gastos fijos ------------------------------
-- 14a) Hasta qué fecha se generó cada gasto fijo. Antes se deducía de la última
--      transacción generada: al borrarla, se volvía a crear en la siguiente petición.
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recurring_expenses' AND COLUMN_NAME = 'last_generated_date'
);
SET @sql = IF(@col_exists = 0, "ALTER TABLE `recurring_expenses` ADD COLUMN `last_generated_date` DATE NULL", 'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;
UPDATE `recurring_expenses` r
SET r.`last_generated_date` = (
    SELECT MAX(t.`transaction_date`) FROM `transactions` t
    WHERE t.`recurring_id` = r.`id` AND t.`user_id` = r.`user_id`
)
WHERE r.`last_generated_date` IS NULL;

-- 14b) Transferencias entre "Saldo del mes" y "Mis ahorros": 0 = movimiento normal,
--      1 = transferencia manual, 2 = ahorro automático mensual. Son filas scope='month'
--      (gasto = a ahorro, ingreso = desde ahorro) que "Mis ahorros" suma con signo contrario.
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'transfer'
);
SET @sql = IF(@col_exists = 0, "ALTER TABLE `transactions` ADD COLUMN `transfer` TINYINT(1) NOT NULL DEFAULT 0", 'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- 14c) Último periodo (su fecha de inicio) con ahorro automático aplicado.
--      Quien ya tenía objetivo empieza a transferir en el próximo periodo, no hoy.
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'auto_savings_period'
);
SET @sql = IF(@col_exists = 0, "ALTER TABLE `users` ADD COLUMN `auto_savings_period` DATE NULL", 'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;
UPDATE `users` SET `auto_savings_period` = CURDATE()
WHERE `auto_savings_period` IS NULL AND `savings_goal_monthly` > 0;

COMMIT;
