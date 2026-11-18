require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./handlers/commandLoader');

async function deploySlashCommands(commandsCollection, fallbackClientId = null) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID || fallbackClientId;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN and CLIENT_ID must be available to register slash commands.');
  }

  const commands = commandsCollection || loadCommands();
  const body = [...commands.values()].map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`[DEPLOY] Registered ${body.length} guild slash commands for guild ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`[DEPLOY] Registered ${body.length} global slash commands.`);
  }
}

if (require.main === module) {
  deploySlashCommands()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DEPLOY_ERROR]', err);
      process.exit(1);
    });
}

module.exports = { deploySlashCommands };
