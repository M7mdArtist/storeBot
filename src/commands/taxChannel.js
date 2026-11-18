const { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, updateGuildSetting } = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('../services/logService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tax-channel')
    .setDescription('Configure an automatic ProBot tax calculation channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a channel where numbers are automatically calculated')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target text channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable automatic tax channel calculation')
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      await updateGuildSetting(interaction.guild.id, { tax_channel_id: channel.id });

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TAX_CHANNEL_UPDATED',
        actor: interaction.user,
        targetId: channel.id,
        details: { status: 'enabled', channel: channel.name },
      });

      return interaction.reply({
        content: t(lang, 'tax.channelSet', { channelId: channel.id }),
        flags: MessageFlags.Ephemeral,
      });
    }

    await updateGuildSetting(interaction.guild.id, { tax_channel_id: null });

    await logAdminAction(interaction.client, interaction.guild.id, {
      actionType: 'TAX_CHANNEL_UPDATED',
      actor: interaction.user,
      targetId: null,
      details: { status: 'disabled' },
    });

    return interaction.reply({
      content: t(lang, 'tax.channelDisabled'),
      flags: MessageFlags.Ephemeral,
    });
  },
};
