const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../database/mysql');
const { t } = require('../utils/i18n');

function buildHelpEmbed(lang, prefix) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t(lang, 'help.title'))
    .setDescription(t(lang, 'help.description', { prefix }))
    .addFields(
      { name: t(lang, 'help.ticketsTitle'), value: t(lang, 'help.ticketsValue', { prefix }) },
      { name: t(lang, 'help.taxTitle'), value: t(lang, 'help.taxValue', { prefix }) },
      { name: t(lang, 'help.lineTitle'), value: t(lang, 'help.lineValue', { prefix }) },
      { name: t(lang, 'help.adminTitle'), value: t(lang, 'help.adminValue', { prefix }) }
    )
    .setTimestamp();
}

module.exports = {
  buildHelpEmbed,
  data: new SlashCommandBuilder().setName('help').setDescription('Show all Store Bot commands'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const prefix = settings.prefix || '+';
    return interaction.reply({
      embeds: [buildHelpEmbed(lang, prefix)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
