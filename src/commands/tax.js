const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../database/mysql');
const { t } = require('../utils/i18n');
const { calculateProBotTax, parseAmount, sendTaxMessage } = require('../utils/taxCalculator');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tax')
    .setDescription('Calculate ProBot 5% credit transfer tax accurately')
    .addStringOption((opt) =>
      opt
        .setName('amount')
        .setDescription('Amount to calculate (supports k, m, b, t such as 50k or 2.5m)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const raw = interaction.options.getString('amount', true);

    const parsed = parseAmount(raw);
    if (!parsed) {
      return interaction.reply({
        content: t(lang, 'tax.invalidAmount'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const breakdown = calculateProBotTax(parsed);
    return sendTaxMessage(
      (payload) => interaction.reply(payload),
      lang,
      breakdown,
      settings.default_line_url
    );
  },
};
