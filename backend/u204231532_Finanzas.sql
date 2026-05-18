-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1:3306
-- Tiempo de generación: 18-05-2026 a las 07:00:02
-- Versión del servidor: 11.8.6-MariaDB-log
-- Versión de PHP: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `u204231532_Finanzas`
--

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
(48, NULL, 'Otros ingresos', '#A3E635', 'attach-money', 'income', '2026-05-08 09:34:22');

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
-- Volcado de datos para la tabla `recurring_expenses`
--

INSERT INTO `recurring_expenses` (`id`, `user_id`, `category_id`, `name`, `amount`, `type`, `frequency`, `start_date`, `end_date`, `is_active`, `notes`, `created_at`, `updated_at`) VALUES
(1, 1, 42, 'Spotify', 3.50, 'expense', 'monthly', '2026-05-04', NULL, 1, NULL, '2026-05-04 08:39:20', '2026-05-08 09:34:22'),
(2, 1, 42, 'Netflix', 8.00, 'expense', 'monthly', '2026-05-04', NULL, 1, NULL, '2026-05-04 08:56:35', '2026-05-08 09:34:22'),
(3, 1, 39, 'Alquiler', 270.00, 'expense', 'monthly', '2026-05-04', NULL, 1, NULL, '2026-05-04 08:56:51', '2026-05-08 09:34:22'),
(4, 1, NULL, 'Inversión', 600.00, 'expense', 'monthly', '2026-05-04', NULL, 1, NULL, '2026-05-04 12:08:00', '2026-05-04 12:08:00'),
(5, 1, 45, 'Salario', 1300.00, 'income', 'monthly', '2026-05-04', NULL, 1, NULL, '2026-05-04 12:09:25', '2026-05-08 09:34:22'),
(6, 4, 39, 'Alquiler', 300.00, 'expense', 'monthly', '2026-05-08', NULL, 1, NULL, '2026-05-08 19:55:10', '2026-05-08 19:55:10'),
(7, 4, 45, 'Nómina', 1400.00, 'income', 'monthly', '2026-05-08', NULL, 1, NULL, '2026-05-08 19:55:54', '2026-05-08 19:55:54'),
(8, 3, 45, 'Salario', 1105.00, 'income', 'monthly', '2026-05-18', NULL, 1, NULL, '2026-05-18 06:37:02', '2026-05-18 06:37:02'),
(9, 3, 42, 'Claude Pro', 18.00, 'expense', 'monthly', '2026-05-18', NULL, 1, NULL, '2026-05-18 06:38:19', '2026-05-18 06:38:19'),
(10, 3, 42, 'Netflix', 6.99, 'expense', 'monthly', '2026-05-18', NULL, 1, NULL, '2026-05-18 06:44:30', '2026-05-18 06:44:30');

-- --------------------------------------------------------

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
-- Volcado de datos para la tabla `savings_goals`
--

INSERT INTO `savings_goals` (`id`, `user_id`, `name`, `target_amount`, `current_amount`, `target_date`, `description`, `color`, `icon`, `is_completed`, `created_at`, `updated_at`) VALUES
(1, 1, 'Coche', 5000.00, 0.00, NULL, NULL, '#10B981', NULL, 0, '2026-05-04 08:39:59', '2026-05-04 08:39:59'),
(2, 3, 'coche', 3000.00, 100.00, NULL, NULL, '#10B981', NULL, 0, '2026-05-08 09:40:44', '2026-05-08 09:40:59'),
(3, 4, 'coche', 15000.00, 150.00, NULL, NULL, '#10B981', NULL, 0, '2026-05-08 19:56:11', '2026-05-08 19:57:24');

-- --------------------------------------------------------

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
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `transactions`
--

INSERT INTO `transactions` (`id`, `user_id`, `category_id`, `amount`, `description`, `type`, `transaction_date`, `notes`, `created_at`, `updated_at`) VALUES
(1, 1, 37, 0.50, 'pan', 'expense', '2026-05-04', NULL, '2026-05-04 08:40:19', '2026-05-08 09:34:22'),
(2, 1, NULL, 1300.00, 'salario', 'income', '2026-05-04', NULL, '2026-05-04 08:41:11', '2026-05-04 08:41:11'),
(4, 4, 37, 0.50, 'Pan', 'expense', '2026-05-08', NULL, '2026-05-08 19:53:52', '2026-05-08 19:53:52'),
(5, 4, 37, 300.00, 'la compra de el mes', 'expense', '2026-05-08', NULL, '2026-05-08 20:00:08', '2026-05-08 20:00:08'),
(6, 3, 37, 0.50, 'prueba', 'expense', '2026-05-18', NULL, '2026-05-18 06:55:27', '2026-05-18 06:55:27'),
(7, 3, 43, 0.50, 'prueba', 'expense', '2026-05-18', NULL, '2026-05-18 06:55:39', '2026-05-18 06:55:39'),
(8, 3, 40, 0.50, 'Ocio', 'expense', '2026-05-18', NULL, '2026-05-18 06:56:11', '2026-05-18 06:56:11');

-- --------------------------------------------------------

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
  `theme` enum('light','dark','system') NOT NULL DEFAULT 'system',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `currency`, `timezone`, `avatar_url`, `theme`, `created_at`, `updated_at`) VALUES
(1, 'Prueba', 'prueba@prueba.es', '$2y$10$d7h9qOl8RyuEXiU95ijvBOwy.XzwG5xODXRO972..ppXft5Es3uzy', 'EUR', 'Europe/Madrid', NULL, 'system', '2026-05-04 08:38:09', '2026-05-04 08:38:09'),
(2, 'prueba2', 'prueba2@prueba2.es', '$2y$10$PrxNNPbQVvKLS8rQkjacjOvl8RUmX5/t3PGBh7tEmy9/jgejUQpKW', 'USD', 'Europe/Madrid', NULL, 'system', '2026-05-04 10:14:15', '2026-05-04 10:30:18'),
(3, 'Ignacio', 'nachonsen@gmail.com', '$2y$10$0lKIpSRCcWeNFqISS1D3TeMV/1JKkFhyef7Ir6Zi5GkvR42UeSVV.', 'EUR', 'Europe/Madrid', NULL, 'system', '2026-05-08 09:00:24', '2026-05-08 09:00:24'),
(4, 'Lourdes', 'prueba@pu.pu', '$2y$10$0WpMSeR4AhME5MEj6/V3CeIzUxfokMI.Db.e18qum1Qi6ebt529ji', 'EUR', 'Europe/Madrid', NULL, 'system', '2026-05-08 19:53:22', '2026-05-08 19:53:22');

--
-- Índices para tablas volcadas
--

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
  ADD KEY `idx_user_date` (`user_id`,`transaction_date`),
  ADD KEY `idx_user_type` (`user_id`,`type`),
  ADD KEY `idx_category` (`category_id`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_email` (`email`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `budgets`
--
ALTER TABLE `budgets`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=49;

--
-- AUTO_INCREMENT de la tabla `recurring_expenses`
--
ALTER TABLE `recurring_expenses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de la tabla `savings_goals`
--
ALTER TABLE `savings_goals`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `transactions`
--
ALTER TABLE `transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

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
  ADD CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
