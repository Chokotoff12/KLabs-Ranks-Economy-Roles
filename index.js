const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { Pool } = require('pg');

const COMMAND_CHANNEL = '1538606334033928253';
const DAILY_AMOUNT = 150;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

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
    .setDescription('Check your KLabsBucks balance'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward')
].map(command => command.toJSON());

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      cash INTEGER DEFAULT 0,
      bank INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      messages INTEGER DEFAULT 0,
      last_daily BIGINT DEFAULT 0
    );
  `);

  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_daily BIGINT DEFAULT 0
    `);
  } catch (err) {}

  console.log('Database ready!');
}

async function getUser(userId) {
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

  return result.rows[0];
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await setupDatabase();

    const rest = new REST({ version: '10' })
      .setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
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

  const userId = interaction.user.id;

  if (interaction.commandName === 'balance') {
    const user = await getUser(userId);

    return interaction.reply({
      content:
`💵 Cash: ${user.cash}
🏦 Bank: ${user.bank}

Total: ${user.cash + user.bank} KLabsBucks`
    });
  }

  if (interaction.commandName === 'daily') {
    const user = await getUser(userId);

    const now = Date.now();
    const timePassed = now - Number(user.last_daily);

    if (timePassed < DAILY_COOLDOWN) {
      const remaining = DAILY_COOLDOWN - timePassed;

      return interaction.reply({
        content:
`⏳ **You have already claimed your daily reward!**

Come back in:
${formatTime(remaining)}`,
        ephemeral: true
      });
    }

    await pool.query(
      `
      UPDATE users
      SET cash = cash + $1,
          last_daily = $2
      WHERE user_id = $3
      `,
      [DAILY_AMOUNT, now, userId]
    );

    return interaction.reply({
      content:
`💵 Daily reward claimed!

+${DAILY_AMOUNT} KLabsBucks`
    });
  }
});

client.login(process.env.TOKEN);
