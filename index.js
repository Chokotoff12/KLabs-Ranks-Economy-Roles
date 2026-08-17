const { Client, GatewayIntentBits } = require('discord.js');
const { Pool } = require('pg');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await setupDatabase();
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.TOKEN);
