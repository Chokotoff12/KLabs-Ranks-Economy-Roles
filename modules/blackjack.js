const activeBlackjackGames = new Map();

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = [
    'A', '2', '3', '4', '5', '6', '7',
    '8', '9', '10', 'J', 'Q', 'K'
  ];

  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

function getCardValue(card) {
  const rank = card.slice(0, -1);

  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;

  return Number(rank);
}

function getHandValue(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    const rank = card.slice(0, -1);

    if (rank === 'A') {
      aces++;
      total += 11;
    } else {
      total += getCardValue(card);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function createGame(userId, bet) {
  const deck = createDeck();

  const playerHand = [
    deck.pop(),
    deck.pop()
  ];

  const dealerHand = [
    deck.pop(),
    deck.pop()
  ];

  const game = {
    userId,
    bet,
    deck,
    playerHand,
    dealerHand
  };

  activeBlackjackGames.set(userId, game);

  return game;
}

function removeGame(userId) {
  activeBlackjackGames.delete(userId);
}

function getGame(userId) {
  return activeBlackjackGames.get(userId);
}

module.exports = {
  activeBlackjackGames,
  createDeck,
  getHandValue,
  createGame,
  removeGame,
  getGame
};
