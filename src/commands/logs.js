const { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, getRecentAdminLogs } = require('../database/mysql');
const { t } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View recent real-time admin audit logs from MySQL')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((opt) =>
      opt
        .setName('limit')
        .setDescription('Number of log entries to display (1-20)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const limit = interaction.options.getInteger('limit') || 10;

    const rows = await getRecentAdminLogs(interaction.guild.id, limit);
    if (rows.length === 0) {
      return interaction.reply({ content: t(lang, 'logs.historyEmpty'), flags: MessageFlags.Ephemeral });
    }

    const lines = rows.map((row) => {
      const ts = Math.floor(new Date(row.created_at).getTime() / 1000);
      const label = t(lang, `logs.actions.${row.action_type}`);
      return `**#${row.id}** · **${label}** · <@${row.actor_id}> · <t:${ts}:R>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t(lang, 'logs.historyTitle'))
      .setDescription(lines.join('\n'))
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
