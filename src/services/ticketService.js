const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const {
  claimTicketRecord,
  closeTicketRecord,
  createTicket,
  deleteTicketRecord,
  findUserOpenTicketInCategory,
  getGuildSettings,
  getTicketByChannel,
  getTicketCategories,
  getTicketCategoryById,
  incrementTicketCounter,
  reopenTicketRecord,
  setTicketWelcomeMessageId,
} = require('../database/mysql');
const { t } = require('../utils/i18n');
const { logAdminAction } = require('./logService');
const { isValidHttpUrl } = require('./lineService');

function parseDiscordEmoji(rawEmoji) {
  if (!rawEmoji) return undefined;
  const trimmed = String(rawEmoji).trim();
  if (!trimmed) return undefined;

  const customMatch = trimmed.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (customMatch) {
    return {
      animated: customMatch[1] === 'a',
      name: customMatch[2],
      id: customMatch[3],
    };
  }
  if (/^\d{17,21}$/.test(trimmed)) {
    return { id: trimmed };
  }
  if (/^[a-zA-Z0-9_ -]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

async function buildTicketPanelPayload(guildId, includeEmojis = true, includeImage = true) {
  const settings = await getGuildSettings(guildId);
  const lang = settings.language || 'ar';
  const categories = await getTicketCategories(guildId);

  if (categories.length === 0) {
    return { empty: true, lang };
  }

  const container = new ContainerBuilder();
  const panelImageUrl = settings.ticket_panel_image_url || settings.default_line_url;

  if (includeImage && isValidHttpUrl(panelImageUrl)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(panelImageUrl.trim())
      )
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${t(lang, 'ticketPanel.title')}`)
    );
  }

  const options = categories.slice(0, 25).map((cat) => {
    const opt = {
      label: cat.name.slice(0, 100),
      description: cat.description.slice(0, 100),
      value: String(cat.id),
    };
    if (includeEmojis) {
      const parsedEmoji = parseDiscordEmoji(cat.emoji);
      if (parsedEmoji) {
        opt.emoji = parsedEmoji;
      }
    }
    return opt;
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open_select')
    .setPlaceholder(t(lang, 'ticketPanel.placeholder'))
    .addOptions(options);

  container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

  const linkButtons = [];
  if (isValidHttpUrl(settings.ticket_rules_url)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          (settings.ticket_rules_label || t(lang, 'ticketPanel.defaultRulesLabel')).slice(0, 80)
        )
        .setStyle(ButtonStyle.Link)
        .setURL(settings.ticket_rules_url.trim())
    );
  }
  if (isValidHttpUrl(settings.ticket_hours_url)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          (settings.ticket_hours_label || t(lang, 'ticketPanel.defaultHoursLabel')).slice(0, 80)
        )
        .setStyle(ButtonStyle.Link)
        .setURL(settings.ticket_hours_url.trim())
    );
  }

  if (linkButtons.length > 0) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...linkButtons));
  }

  return {
    empty: false,
    lang,
    payload: {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    },
  };
}

async function sendPanelWithEmojiFallback(sendFn, guildId) {
  const built = await buildTicketPanelPayload(guildId, true, true);
  if (built.empty) return built;

  try {
    const message = await sendFn(built.payload);
    return { ...built, message };
  } catch (err) {
    if (err && (err.code === 50035 || String(err.message).toLowerCase().includes('emoji'))) {
      try {
        const noEmoji = await buildTicketPanelPayload(guildId, false, true);
        const message = await sendFn(noEmoji.payload);
        return { ...noEmoji, message };
      } catch {
        const safeFallback = await buildTicketPanelPayload(guildId, false, false);
        const message = await sendFn(safeFallback.payload);
        return { ...safeFallback, message };
      }
    }
    try {
      const noImageFallback = await buildTicketPanelPayload(guildId, true, false);
      const message = await sendFn(noImageFallback.payload);
      return { ...noImageFallback, message };
    } catch {
      throw err;
    }
  }
}

async function refreshExistingTicketPanel(client, guildId) {
  try {
    const settings = await getGuildSettings(guildId);
    if (!settings.ticket_panel_channel_id || !settings.ticket_panel_message_id) return false;

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return false;

    const channel =
      guild.channels.cache.get(settings.ticket_panel_channel_id) ||
      (await guild.channels.fetch(settings.ticket_panel_channel_id).catch(() => null));
    if (!channel || !channel.isTextBased()) return false;

    const message = await channel.messages.fetch(settings.ticket_panel_message_id).catch(() => null);
    if (!message) return false;

    const built = await buildTicketPanelPayload(guildId, true, true);
    if (built.empty) {
      const lang = built.lang;
      const emptyContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${t(lang, 'ticketPanel.title')}\n${t(lang, 'ticketPanel.noCategories')}`
        )
      );
      await message
        .edit({
          components: [emptyContainer],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
      return true;
    }

    await sendPanelWithEmojiFallback((payload) => message.edit(payload), guildId);
    return true;
  } catch (err) {
    console.error('[REFRESH_TICKET_PANEL_ERROR]', err.message);
    return false;
  }
}

function buildOpenTicketControls(lang, isClaimed = false) {
  const claimBtn = new ButtonBuilder()
    .setCustomId('ticket_claim')
    .setLabel(t(lang, 'ticket.btnClaim'))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isClaimed);

  const closeBtn = new ButtonBuilder()
    .setCustomId('ticket_close')
    .setLabel(t(lang, 'ticket.btnClose'))
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(claimBtn, closeBtn);
}

function buildClosedTicketControls(lang) {
  const reopenBtn = new ButtonBuilder()
    .setCustomId('ticket_reopen')
    .setLabel(t(lang, 'ticket.btnReopen'))
    .setStyle(ButtonStyle.Primary);

  const deleteBtn = new ButtonBuilder()
    .setCustomId('ticket_delete')
    .setLabel(t(lang, 'ticket.btnDelete'))
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(reopenBtn, deleteBtn);
}

function resolveTicketWelcomeImage(ticket, settings) {
  return (
    ticket?.category_image_url ||
    settings?.ticket_welcome_image_url ||
    settings?.default_line_url ||
    null
  );
}

function buildTicketWelcomePayload({
  lang,
  ticket,
  categoryName,
  categoryEmoji,
  staffMention,
  welcomeImageUrl,
  includeImage = true,
  includeControls = true,
}) {
  const isClosed = ticket.status === 'closed';
  const isClaimed = Boolean(ticket.claimed_by);

  const statusText = isClosed
    ? t(lang, 'ticket.statusClosed')
    : isClaimed
      ? t(lang, 'ticket.statusClaimed')
      : t(lang, 'ticket.statusOpen');

  const claimedByText = ticket.claimed_by
    ? `<@${ticket.claimed_by}>`
    : t(lang, 'ticket.unclaimed');

  const createdUnix = Math.floor(
    (ticket.created_at ? new Date(ticket.created_at).getTime() : Date.now()) / 1000
  );

  const emojiPrefix = categoryEmoji ? `${categoryEmoji} ` : '';
  const container = new ContainerBuilder();

  if (includeImage && isValidHttpUrl(welcomeImageUrl)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(welcomeImageUrl.trim())
      )
    );
  }

  const contentLines = [
    `### ${t(lang, 'ticket.welcomeTitle', { number: ticket.ticket_number, category: categoryName })}`,
    staffMention ? `<@${ticket.user_id}> | ${staffMention}` : `<@${ticket.user_id}>`,
    t(lang, 'ticket.welcomeDesc', { userId: ticket.user_id }),
    '',
    `> **${t(lang, 'ticket.fieldCategory')}:** ${emojiPrefix}${categoryName}`,
    `> **${t(lang, 'ticket.fieldStatus')}:** ${statusText}`,
    `> **${t(lang, 'ticket.fieldClaimedBy')}:** ${claimedByText}`,
    `> **${t(lang, 'ticket.fieldDateCreated')}:** <t:${createdUnix}:f>`,
    '```',
    t(lang, 'ticket.instructionsBox'),
    '```',
  ].join('\n');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentLines));

  if (includeControls) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(buildOpenTicketControls(lang, isClaimed));
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function syncWelcomeEmbedMessage(channel, ticket, lang, settings, includeControls = true) {
  if (!ticket.welcome_message_id) return;
  const welcomeMsg = await channel.messages.fetch(ticket.welcome_message_id).catch(() => null);
  if (!welcomeMsg) return;

  const staffMention = ticket.staff_role_id
    ? `<@&${ticket.staff_role_id}>`
    : t(lang, 'ticket.staffFallback');
  const welcomeImageUrl = resolveTicketWelcomeImage(ticket, settings);

  const payload = buildTicketWelcomePayload({
    lang,
    ticket,
    categoryName: ticket.category_name,
    categoryEmoji: ticket.category_emoji,
    staffMention,
    welcomeImageUrl,
    includeImage: true,
    includeControls,
  });

  try {
    await welcomeMsg.edit(payload);
  } catch {
    const fallback = buildTicketWelcomePayload({
      lang,
      ticket,
      categoryName: ticket.category_name,
      categoryEmoji: ticket.category_emoji,
      staffMention,
      welcomeImageUrl: null,
      includeImage: false,
      includeControls,
    });
    await welcomeMsg.edit(fallback).catch(() => {});
  }
}

async function handleSelectMenuTicketOpen(interaction) {
  const guild = interaction.guild;
  const settings = await getGuildSettings(guild.id);
  const lang = settings.language || 'ar';
  const categoryId = Number(interaction.values[0]);

  const category = await getTicketCategoryById(guild.id, categoryId);
  if (!category) {
    return interaction.reply({
      content: t(lang, 'ticketCategory.notFound', { id: categoryId }),
      flags: MessageFlags.Ephemeral,
    });
  }

  const existing = await findUserOpenTicketInCategory(guild.id, interaction.user.id, category.id);
  if (existing) {
    const existingChan = guild.channels.cache.get(existing.channel_id);
    if (existingChan) {
      return interaction.reply({
        content: t(lang, 'ticket.alreadyOpen', { category: category.name, channelId: existing.channel_id }),
        flags: MessageFlags.Ephemeral,
      });
    }
    await deleteTicketRecord(existing.channel_id).catch(() => {});
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticketNumber = await incrementTicketCounter(guild.id);
  const safeUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  const channelName = `ticket-${String(ticketNumber).padStart(4, '0')}-${safeUser}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (category.staff_role_id) {
    overwrites.push({
      id: category.staff_role_id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const openParent =
    guild.channels.cache.get(category.open_category_id) ||
    (await guild.channels.fetch(category.open_category_id).catch(() => null));

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: openParent && openParent.type === ChannelType.GuildCategory ? openParent.id : undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket #${ticketNumber} | Owner: ${interaction.user.id} | Category: ${category.name}`,
  });

  const createdTicket = await createTicket({
    guildId: guild.id,
    ticketNumber,
    channelId: ticketChannel.id,
    userId: interaction.user.id,
    categoryId: category.id,
  });

  const staffMention = category.staff_role_id
    ? `<@&${category.staff_role_id}>`
    : t(lang, 'ticket.staffFallback');

  const welcomeImageUrl = resolveTicketWelcomeImage(
    { ...createdTicket, category_image_url: category.image_url },
    settings
  );

  let welcomeMsg;
  try {
    welcomeMsg = await ticketChannel.send(
      buildTicketWelcomePayload({
        lang,
        ticket: createdTicket,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        staffMention,
        welcomeImageUrl,
        includeImage: true,
        includeControls: true,
      })
    );
  } catch {
    welcomeMsg = await ticketChannel.send(
      buildTicketWelcomePayload({
        lang,
        ticket: createdTicket,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        staffMention,
        welcomeImageUrl: null,
        includeImage: false,
        includeControls: true,
      })
    );
  }

  await setTicketWelcomeMessageId(ticketChannel.id, welcomeMsg.id);

  await logAdminAction(interaction.client, guild.id, {
    actionType: 'TICKET_OPENED',
    actor: interaction.user,
    targetId: ticketChannel.id,
    details: { ticketNumber, category: category.name, openCategoryId: category.open_category_id },
  });

  await interaction.message
    .edit({ components: interaction.message.components, flags: MessageFlags.IsComponentsV2 })
    .catch(() => {});

  return interaction.editReply({
    content: t(lang, 'ticket.createdReply', { channelId: ticketChannel.id }),
  });
}

async function generateTranscriptAttachment(channel, ticket) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const lines = [];
  lines.push(`=== Ticket #${ticket.ticket_number} (${ticket.category_name}) ===`);
  lines.push(`Owner ID: ${ticket.user_id}`);
  lines.push(`Channel ID: ${channel.id}`);
  lines.push(`Created At: ${ticket.created_at}`);
  lines.push('=================================================');
  lines.push('');

  if (fetched) {
    const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const msg of sorted) {
      const time = new Date(msg.createdTimestamp).toISOString();
      const body = msg.content || (msg.embeds.length ? `[Embed: ${msg.embeds[0].title || 'Embed'}]` : '[Attachment/Component]');
      lines.push(`[${time}] ${msg.author.tag} (${msg.author.id}): ${body}`);
    }
  }

  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), {
    name: `transcript-ticket-${ticket.ticket_number}.txt`,
  });
}

async function claimTicket(channel, actor, replyFn) {
  const settings = await getGuildSettings(channel.guild.id);
  const lang = settings.language || 'ar';
  const ticket = await getTicketByChannel(channel.id);

  if (!ticket) {
    return replyFn({ content: t(lang, 'ticket.notTicketChannel'), flags: MessageFlags.Ephemeral });
  }
  if (ticket.claimed_by) {
    return replyFn({
      content: t(lang, 'ticket.alreadyClaimed', { staffId: ticket.claimed_by }),
      flags: MessageFlags.Ephemeral,
    });
  }

  const updatedTicket = await claimTicketRecord(channel.id, actor.id);
  await syncWelcomeEmbedMessage(channel, updatedTicket, lang, settings, true);

  await logAdminAction(channel.client, channel.guild.id, {
    actionType: 'TICKET_CLAIMED',
    actor,
    targetId: channel.id,
    details: { ticketNumber: ticket.ticket_number, category: ticket.category_name },
  });

  return replyFn({ content: t(lang, 'ticket.claimed', { staffId: actor.id }) });
}

async function closeTicket(channel, actor, replyFn, buttonMessage = null) {
  const settings = await getGuildSettings(channel.guild.id);
  const lang = settings.language || 'ar';
  const ticket = await getTicketByChannel(channel.id);

  if (!ticket) {
    return replyFn({ content: t(lang, 'ticket.notTicketChannel'), flags: MessageFlags.Ephemeral });
  }
  if (ticket.status === 'closed') {
    return replyFn({ content: t(lang, 'ticket.alreadyClosed'), flags: MessageFlags.Ephemeral });
  }

  const closeParent =
    channel.guild.channels.cache.get(ticket.close_category_id) ||
    (await channel.guild.channels.fetch(ticket.close_category_id).catch(() => null));

  if (closeParent && closeParent.type === ChannelType.GuildCategory) {
    await channel.setParent(closeParent.id, { lockPermissions: false }).catch(() => {});
  }

  await channel.permissionOverwrites
    .edit(ticket.user_id, {
      ViewChannel: true,
      SendMessages: false,
    })
    .catch(() => {});

  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (
      overwrite.type === OverwriteType.Member &&
      overwrite.id !== channel.client.user.id &&
      overwrite.id !== ticket.user_id
    ) {
      await channel.permissionOverwrites
        .edit(overwrite.id, { ViewChannel: true, SendMessages: false })
        .catch(() => {});
    }
  }

  const updatedTicket = await closeTicketRecord(channel.id, actor.id);

  // Update original welcome container to Closed status & remove open buttons
  await syncWelcomeEmbedMessage(channel, updatedTicket, lang, settings, false);

  if (buttonMessage && buttonMessage.id !== updatedTicket.welcome_message_id) {
    await buttonMessage.edit({ components: [] }).catch(() => {});
  }

  const transcript = await generateTranscriptAttachment(channel, ticket);

  if (settings.ticket_log_channel_id) {
    const logChan =
      channel.guild.channels.cache.get(settings.ticket_log_channel_id) ||
      (await channel.guild.channels.fetch(settings.ticket_log_channel_id).catch(() => null));
    if (logChan && logChan.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setColor(0x64748b)
        .setTitle(t(lang, 'ticket.transcriptTitle', { number: ticket.ticket_number }))
        .setDescription(
          t(lang, 'ticket.transcriptMeta', {
            ownerId: ticket.user_id,
            category: ticket.category_name,
            closedBy: actor.id,
          })
        )
        .setTimestamp();
      await logChan.send({ embeds: [logEmbed], files: [transcript] }).catch(() => {});
    }
  }

  await logAdminAction(channel.client, channel.guild.id, {
    actionType: 'TICKET_CLOSED',
    actor,
    targetId: channel.id,
    details: {
      ticketNumber: ticket.ticket_number,
      category: ticket.category_name,
      closeCategoryId: ticket.close_category_id,
    },
  });

  return replyFn({
    content: t(lang, 'ticket.closedSuccess'),
    components: [buildClosedTicketControls(lang)],
  });
}

async function reopenTicket(channel, actor, replyFn, buttonMessage = null) {
  const settings = await getGuildSettings(channel.guild.id);
  const lang = settings.language || 'ar';
  const ticket = await getTicketByChannel(channel.id);

  if (!ticket) {
    return replyFn({ content: t(lang, 'ticket.notTicketChannel'), flags: MessageFlags.Ephemeral });
  }
  if (ticket.status !== 'closed') {
    return replyFn({ content: t(lang, 'ticket.notClosed'), flags: MessageFlags.Ephemeral });
  }

  const openParent =
    channel.guild.channels.cache.get(ticket.open_category_id) ||
    (await channel.guild.channels.fetch(ticket.open_category_id).catch(() => null));

  if (openParent && openParent.type === ChannelType.GuildCategory) {
    await channel.setParent(openParent.id, { lockPermissions: false }).catch(() => {});
  }

  await channel.permissionOverwrites
    .edit(ticket.user_id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    })
    .catch(() => {});

  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (
      overwrite.type === OverwriteType.Member &&
      overwrite.id !== channel.client.user.id &&
      overwrite.id !== ticket.user_id
    ) {
      await channel.permissionOverwrites
        .edit(overwrite.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true })
        .catch(() => {});
    }
  }

  const updatedTicket = await reopenTicketRecord(channel.id);

  // Restore original welcome container status & buttons
  await syncWelcomeEmbedMessage(channel, updatedTicket, lang, settings, true);

  if (buttonMessage) {
    await buttonMessage.edit({ components: [] }).catch(() => {});
  }

  await logAdminAction(channel.client, channel.guild.id, {
    actionType: 'TICKET_REOPENED',
    actor,
    targetId: channel.id,
    details: {
      ticketNumber: ticket.ticket_number,
      category: ticket.category_name,
      openCategoryId: ticket.open_category_id,
    },
  });

  const replyPayload = {
    content: t(lang, 'ticket.reopenedDesc', { number: ticket.ticket_number, staffId: actor.id }),
  };
  if (!updatedTicket.welcome_message_id) {
    replyPayload.components = [buildOpenTicketControls(lang, Boolean(updatedTicket.claimed_by))];
  }
  return replyFn(replyPayload);
}

async function deleteTicket(channel, actor, replyFn) {
  const settings = await getGuildSettings(channel.guild.id);
  const lang = settings.language || 'ar';
  const ticket = await getTicketByChannel(channel.id);

  if (!ticket) {
    return replyFn({ content: t(lang, 'ticket.notTicketChannel'), flags: MessageFlags.Ephemeral });
  }

  const transcript = await generateTranscriptAttachment(channel, ticket);
  if (settings.ticket_log_channel_id) {
    const logChan =
      channel.guild.channels.cache.get(settings.ticket_log_channel_id) ||
      (await channel.guild.channels.fetch(settings.ticket_log_channel_id).catch(() => null));
    if (logChan && logChan.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle(t(lang, 'ticket.transcriptTitle', { number: ticket.ticket_number }))
        .setDescription(
          t(lang, 'ticket.transcriptMeta', {
            ownerId: ticket.user_id,
            category: ticket.category_name,
            closedBy: actor.id,
          })
        )
        .setTimestamp();
      await logChan.send({ embeds: [logEmbed], files: [transcript] }).catch(() => {});
    }
  }

  await replyFn({ content: t(lang, 'ticket.deleting') });

  await logAdminAction(channel.client, channel.guild.id, {
    actionType: 'TICKET_DELETED',
    actor,
    targetId: channel.id,
    details: { ticketNumber: ticket.ticket_number, category: ticket.category_name },
  });

  await deleteTicketRecord(channel.id);

  setTimeout(() => {
    channel.delete(`Deleted by ${actor.tag}`).catch(() => {});
  }, 3000);
}

async function requestCloseTicket(channel, actor, replyFn) {
  const settings = await getGuildSettings(channel.guild.id);
  const lang = settings.language || 'ar';
  const ticket = await getTicketByChannel(channel.id);

  if (!ticket) {
    return replyFn({ content: t(lang, 'ticket.notTicketChannel'), flags: MessageFlags.Ephemeral });
  }
  if (ticket.status === 'closed') {
    return replyFn({ content: t(lang, 'ticket.alreadyClosed'), flags: MessageFlags.Ephemeral });
  }

  let staffPing = '';
  if (ticket.claimed_by) {
    staffPing = ` <@${ticket.claimed_by}>`;
  } else if (ticket.staff_role_id) {
    staffPing = ` <@&${ticket.staff_role_id}>`;
  }

  const closeConfirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel(t(lang, 'ticket.btnClose'))
      .setStyle(ButtonStyle.Danger)
  );

  return replyFn({
    content: t(lang, 'ticket.closeRequested', { userId: actor.id, staffPing }),
    components: [closeConfirmRow],
  });
}

module.exports = {
  buildTicketPanelPayload,
  sendPanelWithEmojiFallback,
  refreshExistingTicketPanel,
  handleSelectMenuTicketOpen,
  claimTicket,
  requestCloseTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
};
