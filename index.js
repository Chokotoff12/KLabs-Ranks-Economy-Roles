const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { Pool } = require('pg');

const COMMAND_CHANNEL = '1538606334033928253';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your KLabsBucks balance')
].map(command => command.toJSON());

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      cash INTEGER DEFAULT 0,
      bank INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      messages INTEGER DEFAULT 0
    );
  `);

  console.log('Database ready!');
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await setupDatabase();

    const rest = new REST({ version: '10' })
      .setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log('Commands registered!');
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.channelId !== COMMAND_CHANNEL) {
    return interaction.reply({
      content: '❌ Use economy commands in #commands.',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'balance') {

    const userId = interaction.user.id;

    let result = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (user_id) VALUES ($1)',
        [userId]
      );

      result = await pool.query(
        'SELECT * FROM users WHERE user_id = $1',
        [userId]
      );
    }

    const user = result.rows[0];

    await interaction.reply({
      content:
`💵 Cash: ${user.cash}
🏦 Bank: ${user.bank}

Total: ${user.cash + user.bank} KLabsBucks`
    });
  }
});

client.login(process.env.TOKEN);
