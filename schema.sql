-- Standalone Local MySQL Schema for Discord Store Bot
-- Also executed automatically on startup by src/database/mysql.js

CREATE DATABASE IF NOT EXISTS `discord_store_bot`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `discord_store_bot`;

CREATE TABLE IF NOT EXISTS `guild_settings` (
  `guild_id` VARCHAR(32) NOT NULL,
  `language` ENUM('en', 'ar') NOT NULL DEFAULT 'ar',
  `prefix` VARCHAR(10) NOT NULL DEFAULT '+',
  `ticket_panel_channel_id` VARCHAR(32) NULL,
  `ticket_panel_message_id` VARCHAR(32) NULL,
  `ticket_log_channel_id` VARCHAR(32) NULL,
  `admin_log_channel_id` VARCHAR(32) NULL,
  `tax_channel_id` VARCHAR(32) NULL,
  `default_line_url` TEXT NULL,
  `ticket_panel_image_url` TEXT NULL,
  `ticket_welcome_image_url` TEXT NULL,
  `ticket_rules_label` VARCHAR(80) NULL,
  `ticket_rules_url` TEXT NULL,
  `ticket_hours_label` VARCHAR(80) NULL,
  `ticket_hours_url` TEXT NULL,
  `ticket_counter` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guild_id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `open_category_id` VARCHAR(32) NOT NULL,
  `close_category_id` VARCHAR(32) NOT NULL,
  `description` VARCHAR(100) NOT NULL,
  `emoji` VARCHAR(64) NOT NULL,
  `staff_role_id` VARCHAR(32) NULL,
  `image_url` TEXT NULL,
  `created_by` VARCHAR(32) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ticket_categories_guild` (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guild_id` VARCHAR(32) NOT NULL,
  `ticket_number` INT UNSIGNED NOT NULL,
  `channel_id` VARCHAR(32) NOT NULL,
  `welcome_message_id` VARCHAR(32) NULL,
  `user_id` VARCHAR(32) NOT NULL,
  `category_id` INT UNSIGNED NOT NULL,
  `status` ENUM('open', 'claimed', 'closed') NOT NULL DEFAULT 'open',
  `claimed_by` VARCHAR(32) NULL,
  `closed_by` VARCHAR(32) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ticket_channel` (`channel_id`),
  INDEX `idx_tickets_guild_user` (`guild_id`, `user_id`, `status`),
  CONSTRAINT `fk_tickets_category`
    FOREIGN KEY (`category_id`) REFERENCES `ticket_categories` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `line_presets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guild_id` VARCHAR(32) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `image_url` TEXT NOT NULL,
  `added_by` VARCHAR(32) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_guild_line_name` (`guild_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auto_line_channels` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guild_id` VARCHAR(32) NOT NULL,
  `channel_id` VARCHAR(32) NOT NULL,
  `preset_name` VARCHAR(64) NULL,
  `added_by` VARCHAR(32) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_auto_line_channel` (`channel_id`),
  INDEX `idx_auto_line_guild` (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guild_id` VARCHAR(32) NOT NULL,
  `action_type` VARCHAR(64) NOT NULL,
  `actor_id` VARCHAR(32) NOT NULL,
  `actor_tag` VARCHAR(100) NOT NULL,
  `target_id` VARCHAR(64) NULL,
  `details_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_admin_logs_guild_time` (`guild_id`, `created_at`),
  INDEX `idx_admin_logs_action` (`guild_id`, `action_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
