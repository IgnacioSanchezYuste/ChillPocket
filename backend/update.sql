-- =====================================================
-- Finanzas API · update.sql
-- Aplica los cambios necesarios para la actualización 1.1.0
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- Probado en MariaDB 10.3+ (la sintaxis IF NOT EXISTS para ADD COLUMN
-- está soportada en MariaDB 10.0.2+ y MySQL 8.0+).
-- =====================================================

START TRANSACTION;

-- 1) TRANSACTIONS: tipo de pago, enlace al recurrente y enlace a meta de ahorro
ALTER TABLE `transactions`
    ADD COLUMN IF NOT EXISTS `payment_method` VARCHAR(20) DEFAULT NULL AFTER `notes`,
    ADD COLUMN IF NOT EXISTS `recurring_id`   INT(11)     DEFAULT NULL AFTER `payment_method`,
    ADD COLUMN IF NOT EXISTS `goal_id`        INT(11)     DEFAULT NULL AFTER `recurring_id`;

-- UNIQUE recurrente
SET @has_unique := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'transactions'
      AND INDEX_NAME   = 'uniq_user_recurring_date'
);
SET @sql := IF(@has_unique = 0,
    'ALTER TABLE `transactions` ADD UNIQUE KEY `uniq_user_recurring_date` (`user_id`,`recurring_id`,`transaction_date`)',
    'SELECT "uniq_user_recurring_date ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice recurring_id
SET @has_recurring_idx := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'transactions'
      AND INDEX_NAME   = 'idx_recurring'
);
SET @sql := IF(@has_recurring_idx = 0,
    'ALTER TABLE `transactions` ADD KEY `idx_recurring` (`recurring_id`)',
    'SELECT "idx_recurring ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice goal_id
SET @has_goal_idx := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'transactions'
      AND INDEX_NAME   = 'idx_goal'
);
SET @sql := IF(@has_goal_idx = 0,
    'ALTER TABLE `transactions` ADD KEY `idx_goal` (`goal_id`)',
    'SELECT "idx_goal ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK recurring_id -> recurring_expenses(id) ON DELETE SET NULL
SET @has_fk_rec := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME       = 'transactions'
      AND CONSTRAINT_NAME  = 'transactions_ibfk_3'
);
SET @sql := IF(@has_fk_rec = 0,
    'ALTER TABLE `transactions` ADD CONSTRAINT `transactions_ibfk_3` FOREIGN KEY (`recurring_id`) REFERENCES `recurring_expenses` (`id`) ON DELETE SET NULL',
    'SELECT "transactions_ibfk_3 ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK goal_id -> savings_goals(id) ON DELETE SET NULL
SET @has_fk_goal := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME       = 'transactions'
      AND CONSTRAINT_NAME  = 'transactions_ibfk_4'
);
SET @sql := IF(@has_fk_goal = 0,
    'ALTER TABLE `transactions` ADD CONSTRAINT `transactions_ibfk_4` FOREIGN KEY (`goal_id`) REFERENCES `savings_goals` (`id`) ON DELETE SET NULL',
    'SELECT "transactions_ibfk_4 ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) BUDGETS: día de reinicio del presupuesto
ALTER TABLE `budgets`
    ADD COLUMN IF NOT EXISTS `reset_day` TINYINT(2) NOT NULL DEFAULT 1 AFTER `month_year`;

-- 3) CATEGORIES: categoría sistema "Ahorro" para las contribuciones a metas
INSERT INTO `categories` (`user_id`, `name`, `color`, `icon`, `type`)
SELECT NULL, 'Ahorro', '#10B981', 'savings', 'expense'
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM `categories`
    WHERE `user_id` IS NULL AND `name` = 'Ahorro' AND `type` = 'expense'
);

-- 4) USERS: identificador de Google ("sub" del ID token) para login con Google
ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `google_sub` VARCHAR(64) DEFAULT NULL AFTER `avatar_url`;

SET @has_gsub_idx := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'users'
      AND INDEX_NAME   = 'uniq_google_sub'
);
SET @sql := IF(@has_gsub_idx = 0,
    'ALTER TABLE `users` ADD UNIQUE KEY `uniq_google_sub` (`google_sub`)',
    'SELECT "uniq_google_sub ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

COMMIT;
