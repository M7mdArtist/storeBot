const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { resolveLineImageUrl, sendBigLine } = require('../services/lineService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('line')
    .setDescription('Send a custom server decoration divider line image')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) =>
      opt
        .setName('preset')
        .setDescription('Optional saved preset name (uses default line if omitted)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const presetName = interaction.options.getString('preset');
    const result = await resolveLineImageUrl(interaction.guild.id, presetName);

    if (result.error) {
      return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sendBigLine(interaction.channel, result.imageUrl);
    return interaction.editReply({ content: '✓' });
  },
};
