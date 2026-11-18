const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const {
  addTicketCategory,
  getGuildSettings,
  getTicketCategories,
  removeTicketCategory,
} = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('../services/logService');
const { refreshExistingTicketPanel } = require('../services/ticketService');
const { isValidHttpUrl } = require('../services/lineService');

function isValidImageAttachment(attachment) {
  if (!attachment || !isValidHttpUrl(attachment.url)) return false;
  if (attachment.contentType && attachment.contentType.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(attachment.url);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-category')
    .setDescription('Manage custom dropdown ticket categories')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a custom ticket category to the dropdown menu')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Category display name').setRequired(true).setMaxLength(100)
        )
        .addChannelOption((opt) =>
          opt
            .setName('open_category')
            .setDescription('Discord category channel where open tickets are created')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName('close_category')
            .setDescription('Discord category channel where closed tickets are moved')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('description')
            .setDescription('Short description shown in the dropdown menu')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption((opt) =>
          opt
            .setName('emoji')
            .setDescription('Unicode or custom Discord emoji for the dropdown option')
            .setRequired(true)
            .setMaxLength(64)
        )
        .addRoleOption((opt) =>
          opt
            .setName('staff_role')
            .setDescription('Optional staff role granted access to this ticket category')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('image_url')
            .setDescription('Optional custom image URL shown in tickets of this category')
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName('image_file')
            .setDescription('Optional uploaded image shown in tickets of this category')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List all configured dropdown ticket categories')
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a ticket category by its numeric ID')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('Category ID from /ticket-category list').setRequired(true)
        )
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const existing = await getTicketCategories(interaction.guild.id);
      if (existing.length >= 25) {
        return interaction.reply({
          content: t(lang, 'ticketCategory.limitReached'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const name = interaction.options.getString('name', true).trim();
      const openCategory = interaction.options.getChannel('open_category', true);
      const closeCategory = interaction.options.getChannel('close_category', true);
      const description = interaction.options.getString('description', true).trim();
      const emoji = interaction.options.getString('emoji', true).trim();
      const staffRole = interaction.options.getRole('staff_role');
      const rawImageUrl = interaction.options.getString('image_url')?.trim() || null;
      const imageFile = interaction.options.getAttachment('image_file');

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

      const finalImageUrl = rawImageUrl || (imageFile ? imageFile.url : null);

      const created = await addTicketCategory({
        guildId: interaction.guild.id,
        name,
        openCategoryId: openCategory.id,
        closeCategoryId: closeCategory.id,
        description,
        emoji,
        staffRoleId: staffRole ? staffRole.id : null,
        imageUrl: finalImageUrl,
        createdBy: interaction.user.id,
      });

      await refreshExistingTicketPanel(interaction.client, interaction.guild.id);

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TICKET_CATEGORY_ADDED',
        actor: interaction.user,
        targetId: String(created.id),
        details: {
          name,
          emoji,
          openCategory: `${openCategory.name} (${openCategory.id})`,
          closeCategory: `${closeCategory.name} (${closeCategory.id})`,
          staffRole: staffRole ? staffRole.name : 'None',
          customImage: Boolean(finalImageUrl),
        },
      });

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle(t(lang, 'ticketCategory.addedTitle'))
        .setDescription(t(lang, 'ticketCategory.addedDesc', { name: created.name, id: created.id }))
        .addFields(
          { name: t(lang, 'ticketCategory.fieldOpen'), value: `<#${openCategory.id}>`, inline: true },
          { name: t(lang, 'ticketCategory.fieldClose'), value: `<#${closeCategory.id}>`, inline: true },
          { name: t(lang, 'ticketCategory.fieldEmoji'), value: created.emoji, inline: true },
          { name: t(lang, 'ticketCategory.fieldDesc'), value: created.description, inline: false },
          {
            name: t(lang, 'ticketCategory.fieldRole'),
            value: staffRole ? `<@&${staffRole.id}>` : t(lang, 'ticketCategory.noneRole'),
            inline: true,
          },
          {
            name: t(lang, 'ticketCategory.fieldImage'),
            value: finalImageUrl ? `[Image](${finalImageUrl})` : t(lang, 'ticketCategory.defaultImage'),
            inline: true,
          }
        )
        .setTimestamp();

      if (finalImageUrl) {
        embed.setImage(finalImageUrl);
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const categories = await getTicketCategories(interaction.guild.id);
      if (categories.length === 0) {
        return interaction.reply({
          content: t(lang, 'ticketCategory.listEmpty'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t(lang, 'ticketCategory.listTitle'))
        .setDescription(
          categories
            .map(
              (c) =>
                `**#${c.id}** ${c.emoji} **${c.name}** — ${c.description}\n` +
                `Open: <#${c.open_category_id}> · Close: <#${c.close_category_id}>` +
                (c.staff_role_id ? ` · Role: <@&${c.staff_role_id}>` : '') +
                (c.image_url ? ` · [Image](${c.image_url})` : '')
            )
            .join('\n\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const removed = await removeTicketCategory(interaction.guild.id, id);
      if (!removed) {
        return interaction.reply({
          content: t(lang, 'ticketCategory.notFound', { id }),
          flags: MessageFlags.Ephemeral,
        });
      }

      await refreshExistingTicketPanel(interaction.client, interaction.guild.id);

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TICKET_CATEGORY_REMOVED',
        actor: interaction.user,
        targetId: String(removed.id),
        details: { name: removed.name },
      });

      return interaction.reply({
        content: t(lang, 'ticketCategory.removed', { name: removed.name, id: removed.id }),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
