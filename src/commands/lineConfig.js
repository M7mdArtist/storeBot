const { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  getGuildSettings,
  getLinePresets,
  removeLinePreset,
  updateGuildSetting,
  upsertLinePreset,
} = require('../database/mysql');
const { t } = require('../utils/i18n');
const { isValidHttpUrl } = require('../services/lineService');
const { logAdminAction } = require('../services/logService');
const { refreshExistingTicketPanel } = require('../services/ticketService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('line-config')
    .setDescription('Manage server decoration line images and presets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set-default')
        .setDescription('Set the default decoration line image URL')
        .addStringOption((opt) =>
          opt.setName('image_url').setDescription('Direct HTTPS/HTTP image URL').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-preset')
        .setDescription('Save a named decoration line preset')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Preset name (e.g. gold, store, rules)').setRequired(true).setMaxLength(64)
        )
        .addStringOption((opt) =>
          opt.setName('image_url').setDescription('Direct HTTPS/HTTP image URL').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-preset')
        .setDescription('Remove a saved decoration line preset')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Preset name to remove').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List default and named line images')),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const sub = interaction.options.getSubcommand();

    if (sub === 'set-default') {
      const imageUrl = interaction.options.getString('image_url', true).trim();
      if (!isValidHttpUrl(imageUrl)) {
        return interaction.reply({ content: t(lang, 'common.invalidUrl'), flags: MessageFlags.Ephemeral });
      }

      await updateGuildSetting(interaction.guild.id, { default_line_url: imageUrl });
      await refreshExistingTicketPanel(interaction.client, interaction.guild.id);
      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'LINE_DEFAULT_UPDATED',
        actor: interaction.user,
        targetId: interaction.guild.id,
        details: { imageUrl },
      });

      return interaction.reply({ content: t(lang, 'line.defaultUpdated'), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add-preset') {
      const name = interaction.options.getString('name', true).trim();
      const imageUrl = interaction.options.getString('image_url', true).trim();
      if (!isValidHttpUrl(imageUrl)) {
        return interaction.reply({ content: t(lang, 'common.invalidUrl'), flags: MessageFlags.Ephemeral });
      }

      const preset = await upsertLinePreset({
        guildId: interaction.guild.id,
        name,
        imageUrl,
        addedBy: interaction.user.id,
      });

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'LINE_PRESET_ADDED',
        actor: interaction.user,
        targetId: preset.name,
        details: { name: preset.name, imageUrl },
      });

      return interaction.reply({
        content: t(lang, 'line.presetAdded', { name: preset.name }),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove-preset') {
      const name = interaction.options.getString('name', true).trim();
      const removed = await removeLinePreset(interaction.guild.id, name);
      if (!removed) {
        return interaction.reply({
          content: t(lang, 'line.presetNotFound', { name }),
          flags: MessageFlags.Ephemeral,
        });
      }

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'LINE_PRESET_REMOVED',
        actor: interaction.user,
        targetId: removed.name,
        details: { name: removed.name },
      });

      return interaction.reply({
        content: t(lang, 'line.presetRemoved', { name: removed.name }),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'list') {
      const presets = await getLinePresets(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t(lang, 'line.listTitle'))
        .addFields({
          name: t(lang, 'line.defaultLabel'),
          value: settings.default_line_url ? settings.default_line_url : t(lang, 'line.none'),
          inline: false,
        });

      if (presets.length > 0) {
        embed.setDescription(presets.map((p) => `**${p.name}** — ${p.image_url}`).join('\n'));
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
