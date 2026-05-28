-- =====================================================
-- ChillPocket API · update.sql · v1.5.0 (Fase 1 Billing)
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

-- 5.4) Backfill "early adopter": cualquier usuario YA existente cuando se aplica
-- esta migración recibe Plus gratis de por vida. Idempotente: solo inserta
-- para usuarios sin ninguna fila activa en user_entitlements.
INSERT INTO `user_entitlements` (`user_id`, `plan_code`, `is_active`, `source`)
SELECT u.`id`, 'plus', 1, 'early_adopter'
FROM `users` u
WHERE NOT EXISTS (
    SELECT 1 FROM `user_entitlements` e
    WHERE e.`user_id` = u.`id` AND e.`is_active` = 1
);

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
-- 10b) Flag receipt_photos en planes plus y lifetime:
--      Añade "receipt_photos":true al features_json de plus y lifetime.
--      Se usa JSON_SET para no sobreescribir otras features existentes.
--      El plan 'free' mantiene receipt_photos ausente/false.
--      Family y pro_freelance no son vendibles en esta fase → se ignoran.
--      Todos los UPDATE usan JSON_EXTRACT para ser idempotentes:
--      no modifican si el flag ya está en el valor correcto.
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

-- 10b) receipt_photos: true en plan 'plus' -----------
UPDATE `plans`
  SET `features_json` = JSON_SET(`features_json`, '$.receipt_photos', CAST('true' AS JSON))
  WHERE `code` = 'plus'
    AND (JSON_EXTRACT(`features_json`, '$.receipt_photos') IS NULL
         OR JSON_EXTRACT(`features_json`, '$.receipt_photos') != CAST('true' AS JSON));

-- 10b) receipt_photos: true en plan 'lifetime' -------
-- (El plan lifetime no existe como código independiente en la tabla;
--  las compras lifetime usan el plan_code 'plus' con source='lifetime'.
--  Si en el futuro se añade un código 'lifetime' separado, el UPDATE
--  siguiente lo cubrirá sin romper nada porque el WHERE no matchará si
--  el código no existe todavía.)
UPDATE `plans`
  SET `features_json` = JSON_SET(`features_json`, '$.receipt_photos', CAST('true' AS JSON))
  WHERE `code` = 'lifetime'
    AND (JSON_EXTRACT(`features_json`, '$.receipt_photos') IS NULL
         OR JSON_EXTRACT(`features_json`, '$.receipt_photos') != CAST('true' AS JSON));

-- 10b) receipt_photos: false en plan 'free' ----------
-- Idempotente: solo actualiza si aún no está puesto a false.
UPDATE `plans`
  SET `features_json` = JSON_SET(`features_json`, '$.receipt_photos', CAST('false' AS JSON))
  WHERE `code` = 'free'
    AND (JSON_EXTRACT(`features_json`, '$.receipt_photos') IS NULL
         OR JSON_EXTRACT(`features_json`, '$.receipt_photos') != CAST('false' AS JSON));

COMMIT;
