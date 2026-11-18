const mysql = require('mysql2/promise');

let pool = null;

function getDbConfig() {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'discord_store_bot',
  };
}

async function initDatabase() {
  const config = getDbConfig();

  // Ensure target database exists before opening the connection pool
  const bootstrapConn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    charset: 'utf8mb4',
  });

  await bootstrapConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrapConn.end();

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: 'utf8mb4',
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`guild_settings\` (
      \`guild_id\` VARCHAR(32) NOT NULL,
      \`language\` ENUM('en', 'ar') NOT NULL DEFAULT 'ar',
      \`prefix\` VARCHAR(10) NOT NULL DEFAULT '+',
      \`ticket_panel_channel_id\` VARCHAR(32) NULL,
      \`ticket_panel_message_id\` VARCHAR(32) NULL,
      \`ticket_log_channel_id\` VARCHAR(32) NULL,
      \`admin_log_channel_id\` VARCHAR(32) NULL,
      \`tax_channel_id\` VARCHAR(32) NULL,
      \`default_line_url\` TEXT NULL,
      \`ticket_panel_image_url\` TEXT NULL,
      \`ticket_welcome_image_url\` TEXT NULL,
      \`ticket_rules_label\` VARCHAR(80) NULL,
      \`ticket_rules_url\` TEXT NULL,
      \`ticket_hours_label\` VARCHAR(80) NULL,
      \`ticket_hours_url\` TEXT NULL,
      \`ticket_counter\` INT UNSIGNED NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`guild_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`ticket_categories\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`guild_id\` VARCHAR(32) NOT NULL,
      \`name\` VARCHAR(100) NOT NULL,
      \`open_category_id\` VARCHAR(32) NOT NULL,
      \`close_category_id\` VARCHAR(32) NOT NULL,
      \`description\` VARCHAR(100) NOT NULL,
      \`emoji\` VARCHAR(64) NOT NULL,
      \`staff_role_id\` VARCHAR(32) NULL,
      \`image_url\` TEXT NULL,
      \`created_by\` VARCHAR(32) NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_ticket_categories_guild\` (\`guild_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`tickets\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`guild_id\` VARCHAR(32) NOT NULL,
      \`ticket_number\` INT UNSIGNED NOT NULL,
      \`channel_id\` VARCHAR(32) NOT NULL,
      \`welcome_message_id\` VARCHAR(32) NULL,
      \`user_id\` VARCHAR(32) NOT NULL,
      \`category_id\` INT UNSIGNED NOT NULL,
      \`status\` ENUM('open', 'claimed', 'closed') NOT NULL DEFAULT 'open',
      \`claimed_by\` VARCHAR(32) NULL,
      \`closed_by\` VARCHAR(32) NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`closed_at\` TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_ticket_channel\` (\`channel_id\`),
      INDEX \`idx_tickets_guild_user\` (\`guild_id\`, \`user_id\`, \`status\`),
      CONSTRAINT \`fk_tickets_category\`
        FOREIGN KEY (\`category_id\`) REFERENCES \`ticket_categories\` (\`id\`)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Safe auto-migrations for existing installations
  const migrations = [
    { table: 'tickets', column: 'welcome_message_id', ddl: 'ALTER TABLE `tickets` ADD COLUMN `welcome_message_id` VARCHAR(32) NULL AFTER `channel_id`' },
    { table: 'guild_settings', column: 'ticket_panel_image_url', ddl: 'ALTER TABLE `guild_settings` ADD COLUMN `ticket_panel_image_url` TEXT NULL AFTER `default_line_url`' },
    { table: 'guild_settings', column: 'ticket_welcome_image_url', ddl: 'ALTER TABLE `guild_settings` ADD COLUMN `ticket_welcome_image_url` TEXT NULL AFTER `ticket_panel_image_url`' },
    { table: 'guild_settings', column: 'ticket_rules_label', ddl: 'ALTER TABLE `guild_settings` ADD COLUMN `ticket_rules_label` VARCHAR(80) NULL AFTER `ticket_welcome_image_url`' },
    { table: 'guild_settings', column: 'ticket_rules_url', ddl: 'ALTER TABLE `guild_settings` ADD COLUMN `ticket_rules_url` TEXT NULL AFTER `ticket_rules_label`' },
    { table: 'guild_settings', column: 'ticket_hours_label', ddl: 'ALTER TABLE `guild_settings` ADD COLUMN `ticket_hours_label` VARCHAR(80) NULL AFTER `ticket_rules_url`' },
    { table: 'guild_settings', column: 'ticket_hours_url', ddl: 'ALTER TABLE `guild_settings` ADD COLUMN `ticket_hours_url` TEXT NULL AFTER `ticket_hours_label`' },
    { table: 'ticket_categories', column: 'image_url', ddl: 'ALTER TABLE `ticket_categories` ADD COLUMN `image_url` TEXT NULL AFTER `staff_role_id`' },
  ];
  for (const m of migrations) {
    const [colRows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [config.database, m.table, m.column]
    );
    if (colRows.length === 0) {
      await pool.query(m.ddl);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`line_presets\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`guild_id\` VARCHAR(32) NOT NULL,
      \`name\` VARCHAR(64) NOT NULL,
      \`image_url\` TEXT NOT NULL,
      \`added_by\` VARCHAR(32) NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_guild_line_name\` (\`guild_id\`, \`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`auto_line_channels\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`guild_id\` VARCHAR(32) NOT NULL,
      \`channel_id\` VARCHAR(32) NOT NULL,
      \`preset_name\` VARCHAR(64) NULL,
      \`added_by\` VARCHAR(32) NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_auto_line_channel\` (\`channel_id\`),
      INDEX \`idx_auto_line_guild\` (\`guild_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`admin_logs\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`guild_id\` VARCHAR(32) NOT NULL,
      \`action_type\` VARCHAR(64) NOT NULL,
      \`actor_id\` VARCHAR(32) NOT NULL,
      \`actor_tag\` VARCHAR(100) NOT NULL,
      \`target_id\` VARCHAR(64) NULL,
      \`details_json\` JSON NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_admin_logs_guild_time\` (\`guild_id\`, \`created_at\`),
      INDEX \`idx_admin_logs_action\` (\`guild_id\`, \`action_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('MySQL pool has not been initialized. Call initDatabase() first.');
  }
  return pool;
}

async function getGuildSettings(guildId) {
  const db = getPool();
  const [rows] = await db.query('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
  if (rows.length > 0) return rows[0];

  const defaultLang = process.env.DEFAULT_LANGUAGE === 'en' ? 'en' : 'ar';
  const defaultPrefix = process.env.DEFAULT_PREFIX || '+';
  await db.query(
    'INSERT IGNORE INTO guild_settings (guild_id, language, prefix) VALUES (?, ?, ?)',
    [guildId, defaultLang, defaultPrefix]
  );
  const [created] = await db.query('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
  return created[0];
}

async function updateGuildSetting(guildId, fields) {
  await getGuildSettings(guildId);
  const allowed = [
    'language',
    'prefix',
    'ticket_panel_channel_id',
    'ticket_panel_message_id',
    'ticket_log_channel_id',
    'admin_log_channel_id',
    'tax_channel_id',
    'default_line_url',
    'ticket_panel_image_url',
    'ticket_welcome_image_url',
    'ticket_rules_label',
    'ticket_rules_url',
    'ticket_hours_label',
    'ticket_hours_url',
  ];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (keys.length === 0) return getGuildSettings(guildId);

  const setClause = keys.map((k) => `\`${k}\` = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  await getPool().query(`UPDATE guild_settings SET ${setClause} WHERE guild_id = ?`, [
    ...values,
    guildId,
  ]);
  return getGuildSettings(guildId);
}

async function incrementTicketCounter(guildId) {
  await getGuildSettings(guildId);
  const db = getPool();
  await db.query(
    'UPDATE guild_settings SET ticket_counter = ticket_counter + 1 WHERE guild_id = ?',
    [guildId]
  );
  const [rows] = await db.query('SELECT ticket_counter FROM guild_settings WHERE guild_id = ?', [
    guildId,
  ]);
  return rows[0].ticket_counter;
}

async function getTicketCategories(guildId) {
  const [rows] = await getPool().query(
    'SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY id ASC',
    [guildId]
  );
  return rows;
}

async function getTicketCategoryById(guildId, categoryId) {
  const [rows] = await getPool().query(
    'SELECT * FROM ticket_categories WHERE guild_id = ? AND id = ?',
    [guildId, categoryId]
  );
  return rows[0] || null;
}

async function addTicketCategory({
  guildId,
  name,
  openCategoryId,
  closeCategoryId,
  description,
  emoji,
  staffRoleId,
  imageUrl = null,
  createdBy,
}) {
  const [result] = await getPool().query(
    `INSERT INTO ticket_categories
      (guild_id, name, open_category_id, close_category_id, description, emoji, staff_role_id, image_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guildId,
      name,
      openCategoryId,
      closeCategoryId,
      description,
      emoji,
      staffRoleId || null,
      imageUrl || null,
      createdBy,
    ]
  );
  return getTicketCategoryById(guildId, result.insertId);
}

async function removeTicketCategory(guildId, categoryId) {
  const existing = await getTicketCategoryById(guildId, categoryId);
  if (!existing) return null;
  await getPool().query('DELETE FROM ticket_categories WHERE guild_id = ? AND id = ?', [
    guildId,
    categoryId,
  ]);
  return existing;
}

async function findUserOpenTicketInCategory(guildId, userId, categoryId) {
  const [rows] = await getPool().query(
    `SELECT * FROM tickets
     WHERE guild_id = ? AND user_id = ? AND category_id = ? AND status IN ('open', 'claimed')
     LIMIT 1`,
    [guildId, userId, categoryId]
  );
  return rows[0] || null;
}

async function createTicket({ guildId, ticketNumber, channelId, welcomeMessageId = null, userId, categoryId }) {
  const [result] = await getPool().query(
    `INSERT INTO tickets (guild_id, ticket_number, channel_id, welcome_message_id, user_id, category_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'open')`,
    [guildId, ticketNumber, channelId, welcomeMessageId, userId, categoryId]
  );
  const [rows] = await getPool().query('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function setTicketWelcomeMessageId(channelId, messageId) {
  await getPool().query('UPDATE tickets SET welcome_message_id = ? WHERE channel_id = ?', [
    messageId,
    channelId,
  ]);
}

async function getTicketByChannel(channelId) {
  const [rows] = await getPool().query(
    `SELECT t.*, c.name AS category_name, c.open_category_id, c.close_category_id, c.staff_role_id, c.emoji AS category_emoji, c.image_url AS category_image_url
     FROM tickets t
     JOIN ticket_categories c ON t.category_id = c.id
     WHERE t.channel_id = ?
     LIMIT 1`,
    [channelId]
  );
  return rows[0] || null;
}

async function claimTicketRecord(channelId, staffId) {
  await getPool().query(
    `UPDATE tickets SET status = 'claimed', claimed_by = ? WHERE channel_id = ?`,
    [staffId, channelId]
  );
  return getTicketByChannel(channelId);
}

async function closeTicketRecord(channelId, closedBy) {
  await getPool().query(
    `UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE channel_id = ?`,
    [closedBy, channelId]
  );
  return getTicketByChannel(channelId);
}

async function reopenTicketRecord(channelId) {
  await getPool().query(
    `UPDATE tickets SET status = 'open', closed_by = NULL, closed_at = NULL WHERE channel_id = ?`,
    [channelId]
  );
  return getTicketByChannel(channelId);
}

async function deleteTicketRecord(channelId) {
  await getPool().query('DELETE FROM tickets WHERE channel_id = ?', [channelId]);
}

async function getLinePresets(guildId) {
  const [rows] = await getPool().query(
    'SELECT * FROM line_presets WHERE guild_id = ? ORDER BY name ASC',
    [guildId]
  );
  return rows;
}

async function getLinePresetByName(guildId, name) {
  const [rows] = await getPool().query(
    'SELECT * FROM line_presets WHERE guild_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
    [guildId, name]
  );
  return rows[0] || null;
}

async function upsertLinePreset({ guildId, name, imageUrl, addedBy }) {
  await getPool().query(
    `INSERT INTO line_presets (guild_id, name, image_url, added_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), added_by = VALUES(added_by)`,
    [guildId, name, imageUrl, addedBy]
  );
  return getLinePresetByName(guildId, name);
}

async function removeLinePreset(guildId, name) {
  const existing = await getLinePresetByName(guildId, name);
  if (!existing) return null;
  await getPool().query('DELETE FROM line_presets WHERE guild_id = ? AND id = ?', [
    guildId,
    existing.id,
  ]);
  return existing;
}

async function getAutoLineChannels(guildId) {
  const [rows] = await getPool().query(
    'SELECT * FROM auto_line_channels WHERE guild_id = ? ORDER BY id ASC',
    [guildId]
  );
  return rows;
}

async function getAutoLineChannel(channelId) {
  const [rows] = await getPool().query(
    'SELECT * FROM auto_line_channels WHERE channel_id = ? LIMIT 1',
    [channelId]
  );
  return rows[0] || null;
}

async function upsertAutoLineChannel({ guildId, channelId, presetName = null, addedBy }) {
  await getPool().query(
    `INSERT INTO auto_line_channels (guild_id, channel_id, preset_name, added_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE preset_name = VALUES(preset_name), added_by = VALUES(added_by)`,
    [guildId, channelId, presetName || null, addedBy]
  );
  return getAutoLineChannel(channelId);
}

async function removeAutoLineChannel(guildId, channelId) {
  const existing = await getAutoLineChannel(channelId);
  if (!existing || existing.guild_id !== guildId) return null;
  await getPool().query('DELETE FROM auto_line_channels WHERE guild_id = ? AND channel_id = ?', [
    guildId,
    channelId,
  ]);
  return existing;
}

async function insertAdminLog({ guildId, actionType, actorId, actorTag, targetId, details }) {
  const [result] = await getPool().query(
    `INSERT INTO admin_logs (guild_id, action_type, actor_id, actor_tag, target_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [guildId, actionType, actorId, actorTag, targetId || null, JSON.stringify(details || {})]
  );
  const [rows] = await getPool().query('SELECT * FROM admin_logs WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getRecentAdminLogs(guildId, limit = 10, actionType = null) {
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));
  if (actionType) {
    const [rows] = await getPool().query(
      'SELECT * FROM admin_logs WHERE guild_id = ? AND action_type = ? ORDER BY id DESC LIMIT ?',
      [guildId, actionType, safeLimit]
    );
    return rows;
  }
  const [rows] = await getPool().query(
    'SELECT * FROM admin_logs WHERE guild_id = ? ORDER BY id DESC LIMIT ?',
    [guildId, safeLimit]
  );
  return rows;
}

module.exports = {
  initDatabase,
  getPool,
  getGuildSettings,
  updateGuildSetting,
  incrementTicketCounter,
  getTicketCategories,
  getTicketCategoryById,
  addTicketCategory,
  removeTicketCategory,
  findUserOpenTicketInCategory,
  createTicket,
  setTicketWelcomeMessageId,
  getTicketByChannel,
  claimTicketRecord,
  closeTicketRecord,
  reopenTicketRecord,
  deleteTicketRecord,
  getLinePresets,
  getLinePresetByName,
  upsertLinePreset,
  removeLinePreset,
  getAutoLineChannels,
  getAutoLineChannel,
  upsertAutoLineChannel,
  removeAutoLineChannel,
  insertAdminLog,
  getRecentAdminLogs,
};
