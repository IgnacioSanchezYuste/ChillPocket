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
('free',          'Gratis',         '{"budgets":2,"goals":2,"recurring":1,"custom_categories":8,"history_months":3}',
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

COMMIT;
