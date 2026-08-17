const {
Client,
GatewayIntentBits,
REST,
Routes,
SlashCommandBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle
} = require('discord.js');

const { Pool } = require('pg');

const {
  createGame,
  getGame,
  removeGame,
  getHandValue,
  hitCard
} = require('./modules/blackjack');

const COMMAND_CHANNEL = '1538606334033928253';

const ROB_COOLDOWN = 450000; // 7m30s
const ROB_PERCENTAGE = 0.35;
const ROB_FAIL_CHANCE = 0.15;
const ROB_FINE = 2000;

const DAILY_AMOUNT = 150;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

const WORK_COOLDOWN = 300000;
const WORK_MIN = 65;
const WORK_MAX = 165;

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
    .setDescription('Claim your daily reward'),

  new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work for KLabsBucks'),

  new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Deposit money into your bank')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw money from your bank')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
  .setName('rob')
  .setDescription('Rob another user')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to rob')
      .setRequired(true)
  ),

new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play blackjack')
  .addIntegerOption(option =>
    option
      .setName('bet')
      .setDescription('Bet amount')
      .setRequired(true)
      .setMinValue(100)
  )

  
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
      last_daily BIGINT DEFAULT 0,
      last_work BIGINT DEFAULT 0,
      last_rob BIGINT DEFAULT 0
    );
  `);

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

function formatDailyTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

function formatWorkTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  return `${minutes}m ${seconds}s`;
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
 if (
  !interaction.isChatInputCommand() &&
  !interaction.isButton()
) return;
  
  if (interaction.channelId !== COMMAND_CHANNEL) {
    return interaction.reply({
      content: `${interaction.user}\n\n❌ Use economy commands in #commands.`,
      ephemeral: true
    });
  }

  const userId = interaction.user.id;

  if (interaction.commandName === 'balance') {
    const user = await getUser(userId);

    return interaction.reply({
      content:
`${interaction.user}

💵 Cash: ${user.cash}
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
`${interaction.user}

⏳ **You have already claimed your daily reward!**

Come back in:
${formatDailyTime(remaining)}`,
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
`${interaction.user}

💵 Daily reward claimed!

+${DAILY_AMOUNT} KLabsBucks`
    });
  }

 if (interaction.commandName === 'rob') {

  const target =
    interaction.options.getUser('user');

  if (target.id === interaction.user.id) {
    return interaction.reply({
      content:
`${interaction.user}

❌ You cannot rob yourself.`,
      ephemeral: true
    });
  }

  const robber = await getUser(userId);

  const now = Date.now();
  const timePassed = now - Number(robber.last_rob);

  if (timePassed < ROB_COOLDOWN) {

    const remaining = ROB_COOLDOWN - timePassed;

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return interaction.reply({
      content:
`${interaction.user}

⏳ **The police are still watching you!**

You can rob again in ${minutes}m ${seconds}s.`,
      ephemeral: true
    });
  }

  const victim = await getUser(target.id);

  if (victim.cash <= 0) {
    return interaction.reply({
      content:
`${interaction.user}

❌ This user has no cash available to steal.`,
      ephemeral: true
    });
  }

  const failed =
    Math.random() < ROB_FAIL_CHANCE;

  if (failed) {

    await pool.query(
      `
      UPDATE users
      SET cash = GREATEST(cash - $1, 0),
          last_rob = $2
      WHERE user_id = $3
      `,
      [ROB_FINE, now, userId]
    );

    return interaction.reply({
      content:
`${interaction.user}

🚔 You got caught!

Fine:
${ROB_FINE} KLabsBucks`
    });
  }

  const stolenAmount =
    Math.max(
      1,
      Math.floor(victim.cash * ROB_PERCENTAGE)
    );

  await pool.query(
    `
    UPDATE users
    SET cash = cash - $1
    WHERE user_id = $2
    `,
    [stolenAmount, target.id]
  );

  await pool.query(
    `
    UPDATE users
    SET cash = cash + $1,
        last_rob = $2
    WHERE user_id = $3
    `,
    [stolenAmount, now, userId]
  );

  return interaction.reply({
    content:
`${interaction.user}

💵 Successful robbery!

You stole ${stolenAmount} KLabsBucks.`
  });
}
  
  if (interaction.commandName === 'work') {

    const user = await getUser(userId);

    const now = Date.now();
    const timePassed = now - Number(user.last_work);

    if (timePassed < WORK_COOLDOWN) {

      const remaining = WORK_COOLDOWN - timePassed;

      return interaction.reply({
        content:
`${interaction.user}

⏳ **It's not good to overwork yourself!**

You can work again in ${formatWorkTime(remaining)}.`,
        ephemeral: true
      });
    }

    const earnings =
      Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;

    await pool.query(
      `
      UPDATE users
      SET cash = cash + $1,
          last_work = $2
      WHERE user_id = $3
      `,
      [earnings, now, userId]
    );

    return interaction.reply({
      content:
`${interaction.user}

💵 You finished working and earned ${earnings} KLabsBucks!`
    });
  }

  if (interaction.commandName === 'deposit') {

    const amount =
      interaction.options.getInteger('amount');

    const user = await getUser(userId);

    if (amount > user.cash) {
      return interaction.reply({
        content:
`${interaction.user}

❌ You do not have enough cash.`,
        ephemeral: true
      });
    }

    await pool.query(
      `
      UPDATE users
      SET cash = cash - $1,
          bank = bank + $1
      WHERE user_id = $2
      `,
      [amount, userId]
    );

    return interaction.reply({
      content:
`${interaction.user}

✅ Successfully deposited ${amount} KLabsBucks.`
    });
  }
if (interaction.commandName === 'withdraw') {

  const amount =
    interaction.options.getInteger('amount');

  const user = await getUser(userId);

  if (amount > user.bank) {
    return interaction.reply({
      content:
`${interaction.user}

❌ You do not have enough money in your bank account.`,
      ephemeral: true
    });
  }

  await pool.query(
    `
    UPDATE users
    SET cash = cash + $1,
        bank = bank - $1
    WHERE user_id = $2
    `,
    [amount, userId]
  );

  return interaction.reply({
    content:
`${interaction.user}

✅ Successfully withdrew ${amount} KLabsBucks.`
  });
}
if (interaction.commandName === 'blackjack') {

  const bet =
    interaction.options.getInteger('bet');

  const user = await getUser(userId);

  if (bet > user.cash) {
    return interaction.reply({
      content:
`${interaction.user}

❌ You do not have enough cash for this bet.`,
      ephemeral: true
    });
  }

  if (getGame(userId)) {
    return interaction.reply({
      content:
`${interaction.user}

❌ You already have an active blackjack game.`,
      ephemeral: true
    });
  }

  await pool.query(
    `
    UPDATE users
    SET cash = cash - $1
    WHERE user_id = $2
    `,
    [bet, userId]
  );

  const game = createGame(userId, bet);

  const playerTotal =
    getHandValue(game.playerHand);

  const dealerTotal =
    getHandValue([game.dealerHand[0]]);

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`bj_hit_${userId}`)
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`bj_stand_${userId}`)
        .setLabel('Stand')
        .setStyle(ButtonStyle.Success)
    );

  return interaction.reply({
    content:
`${interaction.user}

🃏 Blackjack Started!

Your Cards:
${game.playerHand.join(' ')}

Your Total:
${playerTotal}

Dealer Cards:
${game.dealerHand[0]} ❓

Dealer Total:
${dealerTotal}`,
    components: [row]
  });
}
if (interaction.isButton()) {
 
const buttonUserId =
interaction.customId.split('_')[2];
 
if (buttonUserId !== interaction.user.id) {
return interaction.reply({
content:
'❌ You cannot use these buttons because this blackjack game is not yours.',
ephemeral: true
});
}
 const action =
  interaction.customId.split('_')[1];

if (action === 'hit') {

  const game = hitCard(interaction.user.id);

  const total =
    getHandValue(game.playerHand);

  if (total > 21) {

    removeGame(interaction.user.id);

    return interaction.update({
      content:
`${interaction.user}

💸 Bust!

Your Cards:
${game.playerHand.join(' ')}

Your Total:
${total}

Loss:
${game.bet} KLabsBucks`,
      components: []
    });
  }

  return interaction.update({
    content:
`${interaction.user}

🃏 Blackjack Started!

Your Cards:
${game.playerHand.join(' ')}

Your Total:
${total}

Dealer Cards:
${game.dealerHand[0]} ❓

Dealer Total:
${getHandValue([game.dealerHand[0]])}`,
    components: interaction.message.components
  });
}

if (action === 'stand') {

  const game =
    getGame(interaction.user.id);

  if (!game) {
    return interaction.reply({
      content:
'❌ Blackjack game not found.',
      ephemeral: true
    });
  }

  while (
    getHandValue(game.dealerHand) < 17
  ) {
    game.dealerHand.push(
      game.deck.pop()
    );
  }

  const playerTotal =
    getHandValue(game.playerHand);

  const dealerTotal =
    getHandValue(game.dealerHand);

  removeGame(interaction.user.id);

  if (
    dealerTotal > 21 ||
    playerTotal > dealerTotal
  ) {

    await pool.query(
      `
      UPDATE users
      SET cash = cash + $1
      WHERE user_id = $2
      `,
      [game.bet * 2, interaction.user.id]
    );

    return interaction.update({
      content:
`${interaction.user}

💵 You won!

Your Cards:
${game.playerHand.join(' ')}

Your Total:
${playerTotal}

Dealer Cards:
${game.dealerHand.join(' ')}

Dealer Total:
${dealerTotal}

Profit:
${game.bet} KLabsBucks`,
      components: []
    });
  }

  if (playerTotal === dealerTotal) {

    await pool.query(
      `
      UPDATE users
      SET cash = cash + $1
      WHERE user_id = $2
      `,
      [game.bet, interaction.user.id]
    );

    return interaction.update({
      content:
`${interaction.user}

🤝 Push!

Your Cards:
${game.playerHand.join(' ')}

Your Total:
${playerTotal}

Dealer Cards:
${game.dealerHand.join(' ')}

Dealer Total:
${dealerTotal}`,
      components: []
    });
  }

  return interaction.update({
    content:
`${interaction.user}

💸 You lost!

Your Cards:
${game.playerHand.join(' ')}

Your Total:
${playerTotal}

Dealer Cards:
${game.dealerHand.join(' ')}

Dealer Total:
${dealerTotal}

Loss:
${game.bet} KLabsBucks`,
    components: []
  });
}

if (interaction.commandName === 'leaderboard') {

  const leaderboard = await pool.query(`
    SELECT user_id,
           cash,
           bank,
           (cash + bank) AS wealth
    FROM users
    ORDER BY wealth DESC
    LIMIT 10
  `);

  const allRanks = await pool.query(`
    SELECT user_id,
           (cash + bank) AS wealth
    FROM users
    ORDER BY wealth DESC
  `);

  const position =
    allRanks.rows.findIndex(
      row => row.user_id === userId
    ) + 1;

  let text =
`🏆 KLabs Richest Players

`;

  for (let i = 0; i < leaderboard.rows.length; i++) {

    const row = leaderboard.rows[i];

    let username;

    try {
      const member =
        await client.users.fetch(row.user_id);

      username = member.username;
    } catch {
      username = 'Unknown User';
    }

    text +=
`#${i + 1} ${username}
💵 ${row.wealth} KLabsBucks

`;
  }

  text +=
`━━━━━━━━━━━━

🏆 **Your Position Is #${position}**`;

  return interaction.reply({
    content: text
  });
}  
}
  
});

client.login(process.env.TOKEN);
