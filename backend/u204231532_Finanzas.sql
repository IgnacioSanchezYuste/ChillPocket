-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1:3306
-- Tiempo de generación: 26-05-2026 a las 13:02:08
-- Versión del servidor: 11.8.6-MariaDB-log
-- Versión de PHP: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

--
-- Base de datos: `u204231532_Finanzas`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `billing_events`
--

CREATE TABLE `billing_events` (
  `id` int(11) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `event_type` varchar(64) NOT NULL,
  `external_id` varchar(128) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `payload_json` longtext NOT NULL,
  `received_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `budgets`
--

CREATE TABLE `budgets` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL CHECK (`amount` >= 0),
  `month_year` char(7) NOT NULL,
  `reset_day` tinyint(2) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categories`
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `color` char(7) NOT NULL DEFAULT '#6366F1',
  `icon` varchar(50) DEFAULT NULL,
  `type` enum('expense','income') NOT NULL DEFAULT 'expense',
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `categories`
--

INSERT INTO `categories` (`id`, `user_id`, `name`, `color`, `icon`, `type`, `created_at`) VALUES
(37, NULL, 'Alimentos', '#F97316', 'restaurant', 'expense', '2026-05-08 09:34:22'),
(38, NULL, 'Transporte', '#3B82F6', 'directions-car', 'expense', '2026-05-08 09:34:22'),
(39, NULL, 'Vivienda', '#8B5CF6', 'home', 'expense', '2026-05-08 09:34:22'),
(40, NULL, 'Ocio', '#EC4899', 'sports-esports', 'expense', '2026-05-08 09:34:22'),
(41, NULL, 'Salud', '#EF4444', 'favorite', 'expense', '2026-05-08 09:34:22'),
(42, NULL, 'Suscripciones', '#0EA5E9', 'subscriptions', 'expense', '2026-05-08 09:34:22'),
(43, NULL, 'Compras', '#14B8A6', 'shopping-bag', 'expense', '2026-05-08 09:34:22'),
(44, NULL, 'Otros gastos', '#6B7280', 'more-horiz', 'expense', '2026-05-08 09:34:22'),
(45, NULL, 'Salario', '#10B981', 'work', 'income', '2026-05-08 09:34:22'),
(46, NULL, 'Freelance', '#22C55E', 'computer', 'income', '2026-05-08 09:34:22'),
(47, NULL, 'Inversiones', '#84CC16', 'trending-up', 'income', '2026-05-08 09:34:22'),
(48, NULL, 'Otros ingresos', '#A3E635', 'attach-money', 'income', '2026-05-08 09:34:22'),
(49, 3, 'Gasolína', '#EF4444', NULL, 'expense', '2026-05-18 08:49:47'),
(50, NULL, 'Ahorro', '#10B981', 'savings', 'expense', '2026-05-19 06:50:21');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `plans`
--

CREATE TABLE `plans` (
  `id` int(11) NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(64) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `limits_json` longtext NOT NULL,
  `features_json` longtext NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

--
-- Volcado de datos para la tabla `plans`
--

INSERT INTO `plans` (`id`, `code`, `name`, `is_active`, `limits_json`, `features_json`, `created_at`) VALUES
(1, 'free', 'Gratis', 1, '{\"budgets\":2,\"goals\":2,\"recurring\":3,\"custom_categories\":8,\"history_months\":3}', '{\"advanced_analytics\":false,\"export\":false,\"web_access\":false,\"cloud_backup\":false,\"family_mode\":false,\"fiscal_reports\":false}', '2026-05-25 08:10:05'),
(2, 'plus', 'Plus', 1, '{\"budgets\":null,\"goals\":null,\"recurring\":null,\"custom_categories\":null,\"history_months\":null}', '{\"advanced_analytics\":true,\"export\":true,\"web_access\":true,\"cloud_backup\":true,\"family_mode\":false,\"fiscal_reports\":false}', '2026-05-25 08:10:05'),
(3, 'family', 'Familia', 1, '{\"budgets\":null,\"goals\":null,\"recurring\":null,\"custom_categories\":null,\"history_months\":null,\"family_members\":5}', '{\"advanced_analytics\":true,\"export\":true,\"web_access\":true,\"cloud_backup\":true,\"family_mode\":true,\"fiscal_reports\":false}', '2026-05-25 08:10:05'),
(4, 'pro_freelance', 'Pro Freelance', 1, '{\"budgets\":null,\"goals\":null,\"recurring\":null,\"custom_categories\":null,\"history_months\":null}', '{\"advanced_analytics\":true,\"export\":true,\"web_access\":true,\"cloud_backup\":true,\"family_mode\":false,\"fiscal_reports\":true}', '2026-05-25 08:10:05');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `recurring_expenses`
--

CREATE TABLE `recurring_expenses` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL CHECK (`amount` >= 0),
  `type` enum('expense','income') NOT NULL DEFAULT 'expense',
  `frequency` enum('weekly','monthly','yearly') NOT NULL DEFAULT 'monthly',
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



--
-- Estructura de tabla para la tabla `savings_goals`
--

CREATE TABLE `savings_goals` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `target_amount` decimal(12,2) NOT NULL CHECK (`target_amount` > 0),
  `current_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `target_date` date DEFAULT NULL,
  `description` text DEFAULT NULL,
  `color` char(7) NOT NULL DEFAULT '#10B981',
  `icon` varchar(50) DEFAULT NULL,
  `is_completed` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


--
-- Estructura de tabla para la tabla `transactions`
--

CREATE TABLE `transactions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL CHECK (`amount` >= 0),
  `description` varchar(500) NOT NULL,
  `type` enum('expense','income') NOT NULL,
  `transaction_date` date NOT NULL,
  `notes` text DEFAULT NULL,
  `payment_method` varchar(20) DEFAULT NULL,
  `recurring_id` int(11) DEFAULT NULL,
  `goal_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



--
-- Estructura de tabla para la tabla `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'EUR',
  `timezone` varchar(64) NOT NULL DEFAULT 'Europe/Madrid',
  `avatar_url` varchar(500) DEFAULT NULL,
  `google_sub` varchar(64) DEFAULT NULL,
  `theme` enum('light','dark','system') NOT NULL DEFAULT 'system',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



--
-- Estructura de tabla para la tabla `user_entitlements`
--

CREATE TABLE `user_entitlements` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `plan_code` varchar(32) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `source` varchar(32) NOT NULL DEFAULT 'manual',
  `expires_at` date DEFAULT NULL,
  `external_subscription_id` varchar(128) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

05-25 08:39:36');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `billing_events`
--
ALTER TABLE `billing_events`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_external_event` (`provider`,`external_id`),
  ADD KEY `idx_provider_type` (`provider`,`event_type`),
  ADD KEY `idx_user` (`user_id`);

--
-- Indices de la tabla `budgets`
--
ALTER TABLE `budgets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_cat_month` (`user_id`,`category_id`,`month_year`),
  ADD KEY `category_id` (`category_id`),
  ADD KEY `idx_user_month` (`user_id`,`month_year`);

--
-- Indices de la tabla `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_name_type` (`user_id`,`name`,`type`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_user_type` (`user_id`,`type`);

--
-- Indices de la tabla `plans`
--
ALTER TABLE `plans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_plan_code` (`code`);

--
-- Indices de la tabla `recurring_expenses`
--
ALTER TABLE `recurring_expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `category_id` (`category_id`),
  ADD KEY `idx_user_active` (`user_id`,`is_active`),
  ADD KEY `idx_user_freq` (`user_id`,`frequency`);

--
-- Indices de la tabla `savings_goals`
--
ALTER TABLE `savings_goals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_user_completed` (`user_id`,`is_completed`);

--
-- Indices de la tabla `transactions`
--
ALTER TABLE `transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_recurring_date` (`user_id`,`recurring_id`,`transaction_date`),
  ADD KEY `idx_user_date` (`user_id`,`transaction_date`),
  ADD KEY `idx_user_type` (`user_id`,`type`),
  ADD KEY `idx_category` (`category_id`),
  ADD KEY `idx_recurring` (`recurring_id`),
  ADD KEY `idx_goal` (`goal_id`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `uniq_google_sub` (`google_sub`),
  ADD KEY `idx_email` (`email`);

--
-- Indices de la tabla `user_entitlements`
--
ALTER TABLE `user_entitlements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_active` (`user_id`,`is_active`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `billing_events`
--
ALTER TABLE `billing_events`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `budgets`
--
ALTER TABLE `budgets`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=51;

--
-- AUTO_INCREMENT de la tabla `plans`
--
ALTER TABLE `plans`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `recurring_expenses`
--
ALTER TABLE `recurring_expenses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT de la tabla `savings_goals`
--
ALTER TABLE `savings_goals`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `transactions`
--
ALTER TABLE `transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=55;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT de la tabla `user_entitlements`
--
ALTER TABLE `user_entitlements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `budgets`
--
ALTER TABLE `budgets`
  ADD CONSTRAINT `budgets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `budgets_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `categories`
--
ALTER TABLE `categories`
  ADD CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `recurring_expenses`
--
ALTER TABLE `recurring_expenses`
  ADD CONSTRAINT `recurring_expenses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `recurring_expenses_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `savings_goals`
--
ALTER TABLE `savings_goals`
  ADD CONSTRAINT `savings_goals_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `transactions`
--
ALTER TABLE `transactions`
  ADD CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `transactions_ibfk_3` FOREIGN KEY (`recurring_id`) REFERENCES `recurring_expenses` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `transactions_ibfk_4` FOREIGN KEY (`goal_id`) REFERENCES `savings_goals` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `user_entitlements`
--
ALTER TABLE `user_entitlements`
  ADD CONSTRAINT `user_entitlements_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;
