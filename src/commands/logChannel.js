const { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, updateGuildSetting } = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('../services/logService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log-channel')
    .setDescription('Configure real-time admin audit log and ticket transcript channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Bind channels for real-time admin logs and ticket transcripts')
        .addChannelOption((opt) =>
          opt
            .setName('admin_channel')
            .setDescription('Channel for real-time admin action embeds')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName('ticket_channel')
            .setDescription('Optional channel for closed ticket transcripts')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';

    const adminChannel = interaction.options.getChannel('admin_channel', true);
    const ticketChannel = interaction.options.getChannel('ticket_channel');

    const updateFields = { admin_log_channel_id: adminChannel.id };
    if (ticketChannel) {
      updateFields.ticket_log_channel_id = ticketChannel.id;
    }

    await updateGuildSetting(interaction.guild.id, updateFields);

    await logAdminAction(interaction.client, interaction.guild.id, {
      actionType: 'LOG_CHANNEL_UPDATED',
      actor: interaction.user,
      targetId: adminChannel.id,
      details: {
        adminLogChannel: adminChannel.name,
        ticketLogChannel: ticketChannel ? ticketChannel.name : 'Unchanged',
      },
    });

    const lines = [t(lang, 'logs.channelSet', { channelId: adminChannel.id })];
    if (ticketChannel) {
      lines.push(t(lang, 'logs.ticketChannelSet', { channelId: ticketChannel.id }));
    }

    return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
