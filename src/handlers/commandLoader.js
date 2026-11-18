const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

function loadCommands() {
  const commands = new Collection();
  const commandsDir = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const cmd = require(path.join(commandsDir, file));
    if (cmd && cmd.data && typeof cmd.execute === 'function') {
      commands.set(cmd.data.name, cmd);
    }
  }
  return commands;
}

module.exports = { loadCommands };
