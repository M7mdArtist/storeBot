const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { updateGuildSetting } = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('../services/logService');
const { refreshExistingTicketPanel } = require('../services/ticketService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Switch server bot language between Arabic and English')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('lang')
        .setDescription('Select language')
        .setRequired(true)
        .addChoices({ name: 'العربية (Arabic)', value: 'ar' }, { name: 'English', value: 'en' })
    ),

  async execute(interaction) {
    const lang = interaction.options.getString('lang', true);
    await updateGuildSetting(interaction.guild.id, { language: lang });
    await refreshExistingTicketPanel(interaction.client, interaction.guild.id);

    await logAdminAction(interaction.client, interaction.guild.id, {
      actionType: 'LANGUAGE_UPDATED',
      actor: interaction.user,
      targetId: interaction.guild.id,
      details: { language: lang },
    });

    return interaction.reply({ content: t(lang, 'language.updated'), flags: MessageFlags.Ephemeral });
  },
};
