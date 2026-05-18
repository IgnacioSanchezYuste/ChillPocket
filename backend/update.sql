-- =====================================================
-- Finanzas API · update.sql
-- Aplica los cambios necesarios para la actualización 1.1.0
-- Idempotente: se puede ejecutar varias veces sin romper nada.
-- Probado en MariaDB 10.3+ (la sintaxis IF NOT EXISTS para ADD COLUMN
-- está soportada en MariaDB 10.0.2+ y MySQL 8.0+).
-- =====================================================

START TRANSACTION;

-- 1) TRANSACTIONS: tipo de pago y enlace al recurrente que lo originó
ALTER TABLE `transactions`
    ADD COLUMN IF NOT EXISTS `payment_method` VARCHAR(20) DEFAULT NULL AFTER `notes`,
    ADD COLUMN IF NOT EXISTS `recurring_id`   INT(11)     DEFAULT NULL AFTER `payment_method`;

-- Índice y UNIQUE para evitar generar dos veces la misma transacción recurrente.
-- Nota: en MariaDB 10.5+ existe CREATE INDEX IF NOT EXISTS, pero por compatibilidad
-- usamos un bloque dinámico.
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

-- Foreign key recurring_id -> recurring_expenses(id) ON DELETE SET NULL
SET @has_fk := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME       = 'transactions'
      AND CONSTRAINT_NAME  = 'transactions_ibfk_3'
);
SET @sql := IF(@has_fk = 0,
    'ALTER TABLE `transactions` ADD CONSTRAINT `transactions_ibfk_3` FOREIGN KEY (`recurring_id`) REFERENCES `recurring_expenses` (`id`) ON DELETE SET NULL',
    'SELECT "transactions_ibfk_3 ya existe" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) BUDGETS: día de reinicio del presupuesto
ALTER TABLE `budgets`
    ADD COLUMN IF NOT EXISTS `reset_day` TINYINT(2) NOT NULL DEFAULT 1 AFTER `month_year`;

COMMIT;

-- =====================================================
-- FIN
-- =====================================================
