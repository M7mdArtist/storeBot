const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, updateGuildSetting } = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('../services/logService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Change the command prefix for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('symbol').setDescription('New prefix (1-5 chars, no spaces)').setRequired(true).setMaxLength(5)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const newPrefix = interaction.options.getString('symbol', true).trim();

    if (!newPrefix || newPrefix.length > 5 || /\s/.test(newPrefix)) {
      return interaction.reply({ content: t(lang, 'prefix.invalid'), flags: MessageFlags.Ephemeral });
    }

    await updateGuildSetting(interaction.guild.id, { prefix: newPrefix });
    await logAdminAction(interaction.client, interaction.guild.id, {
      actionType: 'PREFIX_UPDATED',
      actor: interaction.user,
      targetId: interaction.guild.id,
      details: { prefix: newPrefix },
    });

    return interaction.reply({
      content: t(lang, 'prefix.updated', { prefix: newPrefix }),
      flags: MessageFlags.Ephemeral,
    });
  },
};
