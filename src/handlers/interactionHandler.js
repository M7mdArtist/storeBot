const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, getTicketByChannel } = require('../database/mysql');
const { t } = require('../utils/i18n');
const {
  claimTicket,
  closeTicket,
  deleteTicket,
  handleSelectMenuTicketOpen,
  reopenTicket,
  requestCloseTicket,
} = require('../services/ticketService');

async function hasTicketStaffPermission(interaction, ticket) {
  if (interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (ticket?.staff_role_id && interaction.member.roles.cache.has(ticket.staff_role_id)) return true;
  return false;
}

async function handleInteraction(interaction) {
  try {
    if (!interaction.inGuild()) {
      if (interaction.isRepliable()) {
        return interaction.reply({ content: t('en', 'common.guildOnly'), flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_open_select') {
      await handleSelectMenuTicketOpen(interaction);
      return;
    }

    if (interaction.isButton()) {
      // Handle ProBot Tax Copy button
      if (interaction.customId.startsWith('tax_copy:')) {
        const rawAmount = interaction.customId.slice('tax_copy:'.length);
        return interaction.reply({
          content: rawAmount,
          flags: MessageFlags.Ephemeral,
        });
      }

      const settings = await getGuildSettings(interaction.guild.id);
      const lang = settings.language || 'ar';
      const ticket = await getTicketByChannel(interaction.channel.id);

      if (!ticket && interaction.customId.startsWith('ticket_')) {
        return interaction.reply({
          content: t(lang, 'ticket.notTicketChannel'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const isStaff = await hasTicketStaffPermission(interaction, ticket);

      if (interaction.customId === 'ticket_claim') {
        if (!isStaff) {
          return interaction.reply({
            content: t(lang, 'common.noPermission'),
            flags: MessageFlags.Ephemeral,
          });
        }
        return claimTicket(
          interaction.channel,
          interaction.user,
          (payload) => interaction.reply(payload)
        );
      }

      if (interaction.customId === 'ticket_close') {
        if (isStaff) {
          return closeTicket(
            interaction.channel,
            interaction.user,
            (payload) => interaction.reply(payload),
            interaction.message
          );
        }
        if (interaction.user.id === ticket.user_id) {
          return requestCloseTicket(
            interaction.channel,
            interaction.user,
            (payload) => interaction.reply(payload)
          );
        }
        return interaction.reply({
          content: t(lang, 'common.noPermission'),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'ticket_reopen') {
        if (!isStaff) {
          return interaction.reply({
            content: t(lang, 'common.noPermission'),
            flags: MessageFlags.Ephemeral,
          });
        }
        return reopenTicket(
          interaction.channel,
          interaction.user,
          (payload) => interaction.reply(payload),
          interaction.message
        );
      }

      if (interaction.customId === 'ticket_delete') {
        if (!isStaff) {
          return interaction.reply({
            content: t(lang, 'common.noPermission'),
            flags: MessageFlags.Ephemeral,
          });
        }
        return deleteTicket(interaction.channel, interaction.user, (payload) => interaction.reply(payload));
      }
    }
  } catch (err) {
    console.error('[INTERACTION_ERROR]', err);
    if (interaction.isRepliable()) {
      const settings = interaction.guild
        ? await getGuildSettings(interaction.guild.id).catch(() => ({ language: 'ar' }))
        : { language: 'ar' };
      const msg = t(settings.language || 'ar', 'common.error');
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
}

module.exports = { handleInteraction };
