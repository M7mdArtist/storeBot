const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { t } = require('./i18n');

const SUFFIX_POWERS = {
  k: 3,
  m: 6,
  b: 9,
  t: 12,
};

/**
 * Parses integer/decimal strings with optional shorthand suffixes (k, m, b, t)
 * into a BigInt so huge credit values never lose precision.
 * @param {string|number|bigint} rawInput
 * @returns {bigint|null}
 */
function parseAmount(rawInput) {
  if (typeof rawInput === 'bigint') {
    return rawInput > 0n ? rawInput : null;
  }
  if (typeof rawInput === 'number') {
    if (!Number.isFinite(rawInput) || rawInput <= 0) return null;
    return BigInt(Math.floor(rawInput));
  }
  if (typeof rawInput !== 'string') return null;

  const cleaned = rawInput.trim().toLowerCase().replace(/,/g, '').replace(/_/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
  if (!match) return null;

  const numStr = match[1];
  const suffix = match[2];
  const power = suffix ? SUFFIX_POWERS[suffix] : 0;

  const [wholePart, fracPart = ''] = numStr.split('.');
  const fracSliced = fracPart.slice(0, power);
  const zeroPad = power - fracSliced.length;
  const combinedDigits = `${wholePart}${fracSliced}${'0'.repeat(Math.max(0, zeroPad))}`;

  try {
    const value = BigInt(combinedDigits);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

/**
 * Exact BigInt ProBot 5% tax calculation matching standard Discord tax output:
 *   67,676,767,676,767 -> 71,238,702,817,650 (tax: 3,561,935,140,883)
 * @param {bigint|number|string} inputAmount
 */
function calculateProBotTax(inputAmount) {
  const original = typeof inputAmount === 'bigint' ? inputAmount : parseAmount(inputAmount);
  if (!original || original <= 0n) {
    throw new Error('Amount must be a positive integer.');
  }

  const totalWithTax = original === 1n ? 1n : (original * 20n + 18n) / 19n;
  const tax = totalWithTax - original;

  // Two-step middleman (wasit) transfer total
  const withMiddleman = totalWithTax === 1n ? 1n : (totalWithTax * 20n + 18n) / 19n;

  return {
    originalAmount: original.toString(),
    totalWithTax: totalWithTax.toString(),
    tax: tax.toString(),
    withMiddleman: withMiddleman.toString(),
  };
}

function formatBigIntString(numStr) {
  return String(numStr).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isValidHttpUrl(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    const parsed = new URL(str.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Builds the Discord Components V2 Container payload matching:
 *  - Header (`## حساب الضريبة` / `## Tax Calculator`)
 *  - 3 blockquote lines (`المبلغ الأصلي`, `المبلغ مع الضريبة`, `الضريبة`)
 *  - Divider separator
 *  - Copy button (`نسخ المبلغ مع الضريبة` / `Copy Amount with Tax`)
 *  - Optional MediaGallery showing the guild's default line image
 */
function buildTaxContainerPayload(lang, breakdown, defaultLineUrl = null) {
  const contentLines = [
    `## ${t(lang, 'tax.title')}`,
    `> **${t(lang, 'tax.originalLabel')}:** \`${formatBigIntString(breakdown.originalAmount)}\``,
    `> **${t(lang, 'tax.withTaxLabel')}:** \`${formatBigIntString(breakdown.totalWithTax)}\``,
    `> **${t(lang, 'tax.taxLabel')}:** \`${formatBigIntString(breakdown.tax)}\``,
  ].join('\n');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(contentLines))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tax_copy:${breakdown.totalWithTax}`)
          .setLabel(t(lang, 'tax.copyButton'))
          .setStyle(ButtonStyle.Secondary)
      )
    );

  if (isValidHttpUrl(defaultLineUrl)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(defaultLineUrl.trim())
      )
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * Sends a Components V2 tax message, falling back gracefully without the
 * MediaGallery if Discord rejects an unreachable default_line_url.
 */
async function sendTaxMessage(sendFn, lang, breakdown, defaultLineUrl = null) {
  const payload = buildTaxContainerPayload(lang, breakdown, defaultLineUrl);
  try {
    return await sendFn(payload);
  } catch (err) {
    if (defaultLineUrl) {
      const fallbackPayload = buildTaxContainerPayload(lang, breakdown, null);
      return await sendFn(fallbackPayload);
    }
    throw err;
  }
}

module.exports = {
  parseAmount,
  calculateProBotTax,
  formatBigIntString,
  buildTaxContainerPayload,
  sendTaxMessage,
};
