const { EmbedBuilder } = require('discord.js');
const { getGuildSettings, insertAdminLog } = require('../database/mysql');
const { t } = require('../utils/i18n');

const ACTION_COLORS = {
  LANGUAGE_UPDATED: 0x3b82f6,
  PREFIX_UPDATED: 0x3b82f6,
  LOG_CHANNEL_UPDATED: 0x6366f1,
  TAX_CHANNEL_UPDATED: 0x6366f1,
  TICKET_CATEGORY_ADDED: 0x22c55e,
  TICKET_CATEGORY_REMOVED: 0xef4444,
  TICKET_PANEL_SENT: 0x5865f2,
  TICKET_IMAGE_UPDATED: 0x8b5cf6,
  TICKET_BUTTONS_UPDATED: 0x8b5cf6,
  TICKET_OPENED: 0x22c55e,
  TICKET_CLAIMED: 0xf59e0b,
  TICKET_CLOSED: 0x64748b,
  TICKET_REOPENED: 0x10b981,
  TICKET_DELETED: 0xdc2626,
  TICKET_MEMBER_ADDED: 0x06b6d4,
  TICKET_MEMBER_REMOVED: 0xf97316,
  LINE_DEFAULT_UPDATED: 0x8b5cf6,
  LINE_PRESET_ADDED: 0x8b5cf6,
  LINE_PRESET_REMOVED: 0xef4444,
  AUTO_LINE_CHANNEL_ADDED: 0x8b5cf6,
  AUTO_LINE_CHANNEL_REMOVED: 0xef4444,
};

function formatDetails(details) {
  if (!details || typeof details !== 'object') return '—';
  const entries = Object.entries(details).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `**${k}:** \`${String(v)}\``).join('\n');
}

/**
 * Persists an admin/store action to MySQL and dispatches a real-time
 * localized embed to the configured admin_log_channel_id.
 */
async function logAdminAction(client, guildId, { actionType, actor, targetId = null, details = {} }) {
  try {
    const actorId = actor?.id || 'system';
    const actorTag = actor?.tag || actor?.username || 'System';

    const record = await insertAdminLog({
      guildId,
      actionType,
      actorId,
      actorTag,
      targetId,
      details,
    });

    const settings = await getGuildSettings(guildId);
    const lang = settings.language || 'ar';
    const actionLabel = t(lang, `logs.actions.${actionType}`);

    console.log(
      `[ADMIN_LOG] [${new Date().toISOString()}] guild=${guildId} action=${actionType} actor=${actorTag}(${actorId}) target=${targetId || '-'}`
    );

    if (!settings.admin_log_channel_id || !client) return record;

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return record;

    const logChannel =
      guild.channels.cache.get(settings.admin_log_channel_id) ||
      (await guild.channels.fetch(settings.admin_log_channel_id).catch(() => null));

    if (!logChannel || !logChannel.isTextBased()) return record;

    const embed = new EmbedBuilder()
      .setColor(ACTION_COLORS[actionType] || 0x5865f2)
      .setTitle(actionLabel)
      .addFields(
        {
          name: t(lang, 'logs.actor'),
          value: actorId === 'system' ? actorTag : `<@${actorId}> (\`${actorId}\`)`,
          inline: true,
        },
        {
          name: t(lang, 'logs.target'),
          value: targetId ? `\`${targetId}\`` : '—',
          inline: true,
        },
        {
          name: t(lang, 'logs.details'),
          value: formatDetails(details),
          inline: false,
        }
      )
      .setFooter({ text: `Log #${record.id} • ${actionType}` })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch((err) => {
      console.error('[ADMIN_LOG_SEND_ERROR]', err.message);
    });

    return record;
  } catch (err) {
    console.error('[ADMIN_LOG_ERROR]', err);
    return null;
  }
}

module.exports = { logAdminAction };
