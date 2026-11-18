const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, getTicketByChannel } = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('../services/logService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-member')
    .setDescription('Add or remove a user from the current ticket channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Grant a member access to this ticket')
        .addUserOption((opt) => opt.setName('user').setDescription('Member to add').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Revoke a member access from this ticket')
        .addUserOption((opt) => opt.setName('user').setDescription('Member to remove').setRequired(true))
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guild.id);
    const lang = settings.language || 'ar';
    const ticket = await getTicketByChannel(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: t(lang, 'ticket.notTicketChannel'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user', true);

    if (sub === 'add') {
      await interaction.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TICKET_MEMBER_ADDED',
        actor: interaction.user,
        targetId: interaction.channel.id,
        details: { addedUserId: targetUser.id, ticketNumber: ticket.ticket_number },
      });

      return interaction.reply({ content: t(lang, 'ticket.memberAdded', { userId: targetUser.id }) });
    }

    if (sub === 'remove') {
      await interaction.channel.permissionOverwrites.delete(targetUser.id).catch(() => {});

      await logAdminAction(interaction.client, interaction.guild.id, {
        actionType: 'TICKET_MEMBER_REMOVED',
        actor: interaction.user,
        targetId: interaction.channel.id,
        details: { removedUserId: targetUser.id, ticketNumber: ticket.ticket_number },
      });

      return interaction.reply({ content: t(lang, 'ticket.memberRemoved', { userId: targetUser.id }) });
    }
  },
};
