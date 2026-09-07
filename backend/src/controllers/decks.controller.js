import Deck from "../models/Deck.js";

// Усі колоди належать лише авторизованому власнику (req.userId — publicId,
// проставляє requireAuth) — жодного публічного перегляду чужих колод.

export async function listDecks(req, res) {
  const decks = await Deck.find({ ownerId: req.userId }).sort({ createdAt: -1 });
  res.json({ decks: decks.map((d) => d.toPublicJSON()) });
}

export async function createDeck(req, res) {
  // name/words вже перевірені й нормалізовані мідлваром validate(createDeckSchema)
  const { name, words } = req.body;
  const deck = await Deck.create({ ownerId: req.userId, name, words });
  res.status(201).json({ deck: deck.toPublicJSON() });
}

export async function updateDeck(req, res) {
  const deck = await Deck.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!deck) return res.status(404).json({ error: "Колоду не знайдено" });

  if (req.body.name !== undefined) deck.name = req.body.name;
  if (req.body.words !== undefined) deck.words = req.body.words;
  await deck.save();

  res.json({ deck: deck.toPublicJSON() });
}

export async function deleteDeck(req, res) {
  const deck = await Deck.findOneAndDelete({ _id: req.params.id, ownerId: req.userId });
  if (!deck) return res.status(404).json({ error: "Колоду не знайдено" });
  res.status(204).end();
}
