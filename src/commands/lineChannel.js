const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const {
  getAutoLineChannels,
  getGuildSettings,
  removeAutoLineChannel,
  upsertAutoLineChannel,
} = require('../database/mysql');
const { t } = require('../utils/i18n');
const { resolveLineImageUrl } = require('../services/lineService');
const { logAdminAction } = require('../services/logService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('line-channel')
    .setDescription('Configure channels where the bot sends a decoration line after every message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Enable auto-line after every message in a channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target text channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('preset')
            .setDescription('Optional saved line preset name (defaults to server default line)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Disable auto-line in a channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target text channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List all channels with auto-line enabled')
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const channel = interaction.options.getChannel('channel', true);
      const presetName = interaction.options.getString('preset')?.trim() || null;

      const resolved = await resolveLineImageUrl(interaction.guild.id, presetName);
      if (resolved.error) {
        return interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
      }

      await upsertAutoLineChannel({
        guildId: interaction.guild.id,
        channelId: channel.id,
        presetName: resolved.presetName,
        addedBy: interaction.user.id,
      });

      const presetLabel = resolved.presetName || t(lang, 'line.defaultLabel');

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'AUTO_LINE_CHANNEL_ADDED',
        actor: interaction.user,
        targetId: channel.id,
        details: { channel: channel.name, preset: presetLabel },
      });

      return interaction.reply({
        content: t(lang, 'line.autoAdded', { channelId: channel.id, preset: presetLabel }),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel', true);
      const removed = await removeAutoLineChannel(interaction.guild.id, channel.id);
      if (!removed) {
        return interaction.reply({
          content: t(lang, 'line.autoNotFound', { channelId: channel.id }),
          flags: MessageFlags.Ephemeral,
        });
      }

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'AUTO_LINE_CHANNEL_REMOVED',
        actor: interaction.user,
        targetId: channel.id,
        details: { channel: channel.name },
      });

      return interaction.reply({
        content: t(lang, 'line.autoRemoved', { channelId: channel.id }),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'list') {
      const channels = await getAutoLineChannels(interaction.guild.id);
      if (channels.length === 0) {
        return interaction.reply({
          content: t(lang, 'line.autoListEmpty'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t(lang, 'line.autoListTitle'))
        .setDescription(
          channels
            .map((c) => `<#${c.channel_id}> — **${c.preset_name || t(lang, 'line.defaultLabel')}**`)
            .join('\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
