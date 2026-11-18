const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getGuildSettings, updateGuildSetting } = require('../database/mysql');
const { t } = require('../utils/i18n');
const {
  refreshExistingTicketPanel,
  sendPanelWithEmojiFallback,
} = require('../services/ticketService');
const { logAdminAction } = require('../services/logService');
const { isValidHttpUrl } = require('../services/lineService');

function isValidImageAttachment(attachment) {
  if (!attachment || !isValidHttpUrl(attachment.url)) return false;
  if (attachment.contentType && attachment.contentType.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(attachment.url);
}

function resolveLinkUrl(guildId, rawUrl, channel) {
  if (rawUrl) return rawUrl.trim();
  if (channel) return `https://discord.com/channels/${guildId}/${channel.id}`;
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Deploy the dropdown ticket panel or customize its image and buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('send')
        .setDescription('Send the store dropdown ticket panel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target text channel (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('image_url')
            .setDescription('Optional custom banner image URL for the ticket panel')
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName('image_file')
            .setDescription('Optional uploaded banner image for the ticket panel')
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName('rules_channel')
            .setDescription('Optional Rules channel for the Rules link button')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('rules_url')
            .setDescription('Optional direct URL for the Rules link button')
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName('hours_channel')
            .setDescription('Optional Hours channel for the Hours link button')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('hours_url')
            .setDescription('Optional direct URL for the Hours link button')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-image')
        .setDescription('Set or clear a custom image for the ticket panel or opened tickets')
        .addStringOption((opt) =>
          opt
            .setName('target')
            .setDescription('Where the custom image should appear')
            .setRequired(false)
            .addChoices(
              { name: 'Both (Panel & Ticket Welcome)', value: 'both' },
              { name: 'Ticket Welcome Message Only', value: 'welcome' },
              { name: 'Ticket Dropdown Panel Only', value: 'panel' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('image_url')
            .setDescription('Direct image URL (http:// or https://)')
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName('image_file')
            .setDescription('Upload an image file directly from your device')
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('clear')
            .setDescription('Set true to remove the custom image and fall back to default')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-buttons')
        .setDescription('Configure Rules & Hours link buttons shown beneath the ticket dropdown')
        .addChannelOption((opt) =>
          opt
            .setName('rules_channel')
            .setDescription('Discord channel to open when clicking the Rules button')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('rules_url')
            .setDescription('Direct URL for the Rules button (overrides rules_channel)')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('rules_label')
            .setDescription('Custom label for the Rules button (default: Rules)')
            .setRequired(false)
            .setMaxLength(80)
        )
        .addChannelOption((opt) =>
          opt
            .setName('hours_channel')
            .setDescription('Discord channel to open when clicking the Hours button')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('hours_url')
            .setDescription('Direct URL for the Hours button (overrides hours_channel)')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('hours_label')
            .setDescription('Custom label for the Hours button (default: Hours)')
            .setRequired(false)
            .setMaxLength(80)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('clear')
            .setDescription('Set true to remove both link buttons from the ticket panel')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const sub = interaction.options.getSubcommand();

    if (sub === 'set-buttons') {
      const shouldClear = interaction.options.getBoolean('clear') || false;
      const rulesChannel = interaction.options.getChannel('rules_channel');
      const rawRulesUrl = interaction.options.getString('rules_url')?.trim() || null;
      const rulesLabel = interaction.options.getString('rules_label')?.trim() || null;
      const hoursChannel = interaction.options.getChannel('hours_channel');
      const rawHoursUrl = interaction.options.getString('hours_url')?.trim() || null;
      const hoursLabel = interaction.options.getString('hours_label')?.trim() || null;

      if (rawRulesUrl && !isValidHttpUrl(rawRulesUrl)) {
        return interaction.reply({ content: t(lang, 'common.invalidUrl'), flags: MessageFlags.Ephemeral });
      }
      if (rawHoursUrl && !isValidHttpUrl(rawHoursUrl)) {
        return interaction.reply({ content: t(lang, 'common.invalidUrl'), flags: MessageFlags.Ephemeral });
      }

      if (shouldClear) {
        await updateGuildSetting(interaction.guild.id, {
          ticket_rules_label: null,
          ticket_rules_url: null,
          ticket_hours_label: null,
          ticket_hours_url: null,
        });
        await refreshExistingTicketPanel(interaction.client, interaction.guild.id);
        await logAdminAction(interaction.client, interaction.guild.id, {
          actionType: 'TICKET_BUTTONS_UPDATED',
          actor: interaction.user,
          targetId: interaction.guild.id,
          details: { cleared: true },
        });
        return interaction.reply({
          content: t(lang, 'ticketPanel.buttonsCleared'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const rulesUrl = resolveLinkUrl(interaction.guild.id, rawRulesUrl, rulesChannel);
      const hoursUrl = resolveLinkUrl(interaction.guild.id, rawHoursUrl, hoursChannel);

      if (!rulesUrl && !hoursUrl && !rulesLabel && !hoursLabel) {
        return interaction.reply({
          content: t(lang, 'ticketPanel.buttonsMissing'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const updates = {};
      if (rulesUrl) updates.ticket_rules_url = rulesUrl;
      if (rulesLabel) updates.ticket_rules_label = rulesLabel;
      if (hoursUrl) updates.ticket_hours_url = hoursUrl;
      if (hoursLabel) updates.ticket_hours_label = hoursLabel;

      await updateGuildSetting(interaction.guild.id, updates);
      await refreshExistingTicketPanel(interaction.client, interaction.guild.id);

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TICKET_BUTTONS_UPDATED',
        actor: interaction.user,
        targetId: interaction.guild.id,
        details: { rulesUrl: rulesUrl || 'unchanged', hoursUrl: hoursUrl || 'unchanged' },
      });

      return interaction.reply({
        content: t(lang, 'ticketPanel.buttonsUpdated'),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'set-image') {
      const target = interaction.options.getString('target') || 'both';
      const rawImageUrl = interaction.options.getString('image_url')?.trim() || null;
      const imageFile = interaction.options.getAttachment('image_file');
      const shouldClear = interaction.options.getBoolean('clear') || false;

      if (!shouldClear && !rawImageUrl && !imageFile) {
        return interaction.reply({
          content: t(lang, 'ticketPanel.imageMissing'),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (rawImageUrl && !isValidHttpUrl(rawImageUrl)) {
        return interaction.reply({
          content: t(lang, 'common.invalidUrl'),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (imageFile && !isValidImageAttachment(imageFile)) {
        return interaction.reply({
          content: t(lang, 'ticketPanel.invalidImage'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const finalUrl = shouldClear ? null : rawImageUrl || imageFile.url;
      const updates = {};
      if (target === 'panel' || target === 'both') {
        updates.ticket_panel_image_url = finalUrl;
      }
      if (target === 'welcome' || target === 'both') {
        updates.ticket_welcome_image_url = finalUrl;
      }

      await updateGuildSetting(interaction.guild.id, updates);

      if (target === 'panel' || target === 'both') {
        await refreshExistingTicketPanel(interaction.client, interaction.guild.id);
      }

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TICKET_IMAGE_UPDATED',
        actor: interaction.user,
        targetId: target,
        details: { cleared: shouldClear, imageUrl: finalUrl },
      });

      return interaction.reply({
        content: shouldClear ? t(lang, 'ticketPanel.imageCleared') : t(lang, 'ticketPanel.imageUpdated'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const rawImageUrl = interaction.options.getString('image_url')?.trim() || null;
    const imageFile = interaction.options.getAttachment('image_file');
    const rulesChannel = interaction.options.getChannel('rules_channel');
    const rawRulesUrl = interaction.options.getString('rules_url')?.trim() || null;
    const hoursChannel = interaction.options.getChannel('hours_channel');
    const rawHoursUrl = interaction.options.getString('hours_url')?.trim() || null;

    if (rawImageUrl && !isValidHttpUrl(rawImageUrl)) {
      return interaction.reply({
        content: t(lang, 'common.invalidUrl'),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (rawRulesUrl && !isValidHttpUrl(rawRulesUrl)) {
      return interaction.reply({
        content: t(lang, 'common.invalidUrl'),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (rawHoursUrl && !isValidHttpUrl(rawHoursUrl)) {
      return interaction.reply({
        content: t(lang, 'common.invalidUrl'),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (imageFile && !isValidImageAttachment(imageFile)) {
      return interaction.reply({
        content: t(lang, 'ticketPanel.invalidImage'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const panelUpdates = {};
    const chosenPanelImage = rawImageUrl || (imageFile ? imageFile.url : null);
    if (chosenPanelImage) panelUpdates.ticket_panel_image_url = chosenPanelImage;

    const rulesUrl = resolveLinkUrl(interaction.guild.id, rawRulesUrl, rulesChannel);
    if (rulesUrl) panelUpdates.ticket_rules_url = rulesUrl;

    const hoursUrl = resolveLinkUrl(interaction.guild.id, rawHoursUrl, hoursChannel);
    if (hoursUrl) panelUpdates.ticket_hours_url = hoursUrl;

    if (Object.keys(panelUpdates).length > 0) {
      await updateGuildSetting(interaction.guild.id, panelUpdates);
    }

    const sent = await sendPanelWithEmojiFallback((payload) => targetChannel.send(payload), interaction.guild.id);
    if (sent.empty) {
      return interaction.reply({
        content: t(lang, 'ticketPanel.noCategories'),
        flags: MessageFlags.Ephemeral,
      });
    }

    await updateGuildSetting(interaction.guild.id, {
      ticket_panel_channel_id: targetChannel.id,
      ticket_panel_message_id: sent.message.id,
    });

    await logAdminAction(interaction.client, interaction.guild.id, {
      actionType: 'TICKET_PANEL_SENT',
      actor: interaction.user,
      targetId: targetChannel.id,
      details: { messageId: sent.message.id, customImage: Boolean(chosenPanelImage) },
    });

    return interaction.reply({
      content: t(lang, 'ticketPanel.sent', { channelId: targetChannel.id }),
      flags: MessageFlags.Ephemeral,
    });
  },
};

