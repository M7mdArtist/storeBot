require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { initDatabase } = require('./database/mysql');
const { loadCommands } = require('./handlers/commandLoader');
const { handleInteraction } = require('./handlers/interactionHandler');
const { handlePrefixMessage } = require('./handlers/prefixHandler');
const { deploySlashCommands } = require('./deploy-commands');

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED_REJECTION]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
});

async function bootstrap() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('[BOOT_ERROR] DISCORD_TOKEN is missing in environment variables.');
    process.exit(1);
  }

  console.log('[MYSQL] Connecting and verifying local MySQL schema...');
  await initDatabase();
  console.log('[MYSQL] Database ready.');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.commands = loadCommands();
  console.log(`[BOT] Loaded ${client.commands.size} slash command modules.`);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[BOT] Logged in as ${readyClient.user.tag} (${readyClient.user.id})`);
    await deploySlashCommands(client.commands, readyClient.user.id).catch((err) => {
      console.error('[DEPLOY_WARNING]', err.message);
    });
  });

  client.on(Events.InteractionCreate, handleInteraction);
  client.on(Events.MessageCreate, handlePrefixMessage);

  await client.login(process.env.DISCORD_TOKEN);
}

bootstrap().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
