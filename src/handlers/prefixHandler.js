const { PermissionFlagsBits } = require('discord.js');
const {
  getAutoLineChannel,
  getGuildSettings,
  getTicketByChannel,
  updateGuildSetting,
} = require('../database/mysql');
const { t } = require('../utils/i18n');
const { calculateProBotTax, parseAmount, sendTaxMessage } = require('../utils/taxCalculator');
const { resolveLineImageUrl, sendBigLine } = require('../services/lineService');
const { logAdminAction } = require('../services/logService');
const {
  claimTicket,
  closeTicket,
  refreshExistingTicketPanel,
  reopenTicket,
  requestCloseTicket,
} = require('../services/ticketService');
const { buildHelpEmbed } = require('../commands/help');

async function maybeSendAutoLine(message, prefix) {
  const autoLine = await getAutoLineChannel(message.channel.id);
  if (!autoLine) return;

  // Avoid duplicate line if user explicitly invoked +line / +خط
  const trimmed = message.content.trim();
  if (trimmed.startsWith(prefix)) {
    const firstWord = trimmed.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (firstWord === 'line' || firstWord === 'خط') return;
  }

  const resolved = await resolveLineImageUrl(message.guild.id, autoLine.preset_name || null);
  if (!resolved.error && resolved.imageUrl) {
    await sendBigLine(message.channel, resolved.imageUrl).catch((err) => {
      console.error('[AUTO_LINE_ERROR]', err.message);
    });
  }
}

async function handlePrefixMessage(message) {
  try {
    if (message.author.bot || message.webhookId || message.system || !message.guild) return;

    const settings = await getGuildSettings(message.guild.id);
    const lang = settings.language || 'ar';
    const prefix = settings.prefix || '+';
    const content = message.content.trim();

    // Auto-tax channel handling when message is not prefixed
    if (settings.tax_channel_id === message.channel.id && !content.startsWith(prefix)) {
      const autoAmount = parseAmount(content);
      if (autoAmount) {
        const breakdown = calculateProBotTax(autoAmount);
        await sendTaxMessage(
          (payload) => message.reply(payload),
          lang,
          breakdown,
          settings.default_line_url
        );
      }
      await maybeSendAutoLine(message, prefix);
      return;
    }

    if (!content.startsWith(prefix)) {
      await maybeSendAutoLine(message, prefix);
      return;
    }

    const rawBody = content.slice(prefix.length).trim();
    if (!rawBody) return;

    const args = rawBody.split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // 1. ProBot Tax Calculator: +tax / +ضريبة
    if (cmd === 'tax' || cmd === 'ضريبة' || cmd === 'ضريبه') {
      const amount = parseAmount(args[0]);
      if (!amount) {
        return message.reply({ content: t(lang, 'tax.invalidAmount') });
      }
      const breakdown = calculateProBotTax(amount);
      return sendTaxMessage(
        (payload) => message.reply(payload),
        lang,
        breakdown,
        settings.default_line_url
      );
    }

    // 2. Decoration Line Command: +line / +خط
    if (cmd === 'line' || cmd === 'خط') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply({ content: t(lang, 'common.noPermission') });
      }
      const presetName = args[0] || null;
      const result = await resolveLineImageUrl(message.guild.id, presetName);
      if (result.error) {
        return message.reply({ content: result.error });
      }
      await message.delete().catch(() => {});
      return sendBigLine(message.channel, result.imageUrl);
    }

    // 3. Language Switch: +lang / +language / +لغة
    if (cmd === 'lang' || cmd === 'language' || cmd === 'لغة' || cmd === 'لغه') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply({ content: t(lang, 'common.noPermission') });
      }
      const nextLang = (args[0] || '').toLowerCase();
      if (nextLang !== 'ar' && nextLang !== 'en') {
        return message.reply({ content: t(lang, 'language.invalid') });
      }
      await updateGuildSetting(message.guild.id, { language: nextLang });
      await refreshExistingTicketPanel(message.client, message.guild.id);
      await logAdminAction(message.client, message.guild.id, {
        actionType: 'LANGUAGE_UPDATED',
        actor: message.author,
        targetId: message.guild.id,
        details: { language: nextLang },
      });
      return message.reply({ content: t(nextLang, 'language.updated') });
    }

    // 4. Prefix Switch: +prefix / +بادئة
    if (cmd === 'prefix' || cmd === 'بادئة' || cmd === 'بادئه') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply({ content: t(lang, 'common.noPermission') });
      }
      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 5 || /\s/.test(newPrefix)) {
        return message.reply({ content: t(lang, 'prefix.invalid') });
      }
      await updateGuildSetting(message.guild.id, { prefix: newPrefix });
      await logAdminAction(message.client, message.guild.id, {
        actionType: 'PREFIX_UPDATED',
        actor: message.author,
        targetId: message.guild.id,
        details: { prefix: newPrefix },
      });
      return message.reply({ content: t(lang, 'prefix.updated', { prefix: newPrefix }) });
    }

    // 5. Ticket Prefix Shortcuts: +claim, +close, +reopen, +add, +remove
    if (cmd === 'claim' || cmd === 'استلام') {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return message.reply({ content: t(lang, 'ticket.notTicketChannel') });
      const isStaff =
        message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        (ticket.staff_role_id && message.member.roles.cache.has(ticket.staff_role_id));
      if (!isStaff) return message.reply({ content: t(lang, 'common.noPermission') });
      return claimTicket(message.channel, message.author, (p) => message.reply(p));
    }

    if (cmd === 'close' || cmd === 'اغلاق' || cmd === 'إغلاق') {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return message.reply({ content: t(lang, 'ticket.notTicketChannel') });
      const isStaff =
        message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        (ticket.staff_role_id && message.member.roles.cache.has(ticket.staff_role_id));
      if (isStaff) {
        return closeTicket(message.channel, message.author, (p) => message.reply(p));
      }
      if (message.author.id === ticket.user_id) {
        return requestCloseTicket(message.channel, message.author, (p) => message.reply(p));
      }
      return message.reply({ content: t(lang, 'common.noPermission') });
    }

    if (cmd === 'reopen' || cmd === 'فتح') {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return message.reply({ content: t(lang, 'ticket.notTicketChannel') });
      const isStaff =
        message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        (ticket.staff_role_id && message.member.roles.cache.has(ticket.staff_role_id));
      if (!isStaff) return message.reply({ content: t(lang, 'common.noPermission') });
      return reopenTicket(message.channel, message.author, (p) => message.reply(p));
    }

    if (cmd === 'add' || cmd === 'اضافة' || cmd === 'إضافة') {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return message.reply({ content: t(lang, 'ticket.notTicketChannel') });
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply({ content: t(lang, 'common.noPermission') });
      }
      const target =
        message.mentions.users.first() ||
        (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) {
        return message.reply({ content: t(lang, 'ticket.mentionRequired') });
      }
      await message.channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await logAdminAction(message.client, message.guild.id, {
        actionType: 'TICKET_MEMBER_ADDED',
        actor: message.author,
        targetId: message.channel.id,
        details: { addedUserId: target.id, ticketNumber: ticket.ticket_number },
      });
      return message.reply({ content: t(lang, 'ticket.memberAdded', { userId: target.id }) });
    }

    if (cmd === 'remove' || cmd === 'ازالة' || cmd === 'إزالة') {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return message.reply({ content: t(lang, 'ticket.notTicketChannel') });
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply({ content: t(lang, 'common.noPermission') });
      }
      const target =
        message.mentions.users.first() ||
        (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
      if (!target) {
        return message.reply({ content: t(lang, 'ticket.mentionRequired') });
      }
      await message.channel.permissionOverwrites.delete(target.id).catch(() => {});
      await logAdminAction(message.client, message.guild.id, {
        actionType: 'TICKET_MEMBER_REMOVED',
        actor: message.author,
        targetId: message.channel.id,
        details: { removedUserId: target.id, ticketNumber: ticket.ticket_number },
      });
      return message.reply({ content: t(lang, 'ticket.memberRemoved', { userId: target.id }) });
    }

    // 6. Help: +help / +مساعدة
    if (cmd === 'help' || cmd === 'مساعدة' || cmd === 'مساعده') {
      return message.reply({ embeds: [buildHelpEmbed(lang, prefix)] });
    }
  } catch (err) {
    console.error('[PREFIX_HANDLER_ERROR]', err);
  }
}

module.exports = { handlePrefixMessage };
