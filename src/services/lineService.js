const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const { getGuildSettings, getLinePresetByName } = require('../database/mysql');
const { t } = require('../utils/i18n');

function isValidHttpUrl(str) {
  try {
    const parsed = new URL(str);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function resolveLineImageUrl(guildId, presetName = null) {
  const settings = await getGuildSettings(guildId);
  const lang = settings.language || 'ar';

  if (presetName) {
    const preset = await getLinePresetByName(guildId, presetName);
    if (!preset) {
      return { error: t(lang, 'line.presetNotFound', { name: presetName }), lang };
    }
    return { imageUrl: preset.image_url, presetName: preset.name, lang };
  }

  if (!settings.default_line_url) {
    return { error: t(lang, 'line.noLineConfigured'), lang };
  }

  return { imageUrl: settings.default_line_url, presetName: null, lang };
}

function detectExtension(imageUrl, contentType = '') {
  const ct = String(contentType).toLowerCase();
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';

  try {
    const pathname = new URL(imageUrl).pathname;
    const ext = path.extname(pathname).replace('.', '').toLowerCase();
    if (['gif', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {
    // fallback below
  }
  return 'png';
}

/**
 * Sends the decoration line as a standalone full-width image attachment so it
 * renders at maximum width in Discord chat (larger than inside an Embed card).
 */
async function sendBigLine(channel, imageUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const ext = detectExtension(imageUrl, res.headers.get('content-type') || '');
      const attachment = new AttachmentBuilder(buffer, { name: `line.${ext}` });
      return await channel.send({ files: [attachment] });
    }
  } catch {
    // Fall back to direct URL attachment or raw image link below
  }

  try {
    const ext = detectExtension(imageUrl);
    const attachment = new AttachmentBuilder(imageUrl, { name: `line.${ext}` });
    return await channel.send({ files: [attachment] });
  } catch {
    return await channel.send({ content: imageUrl });
  }
}

module.exports = {
  isValidHttpUrl,
  resolveLineImageUrl,
  sendBigLine,
};
