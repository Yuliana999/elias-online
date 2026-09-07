import mongoose from "mongoose";

/*
  Улюблена "колода" слів гравця — набір слів, які він придумав заздалегідь
  і хоче перевикористовувати для гри з друзями (насамперед у режимі
  "custom"/"Підставний суддя", де слова треба подавати самому щоразу).
  Належить конкретному User (ownerId — publicId, а не внутрішній _id,
  щоб лишатись послідовними з рештою моделей, які показують у API лише
  publicId).
*/
const deckSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    words: { type: [String], default: [] },
  },
  { timestamps: true }
);

deckSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    words: this.words,
    wordsCount: this.words.length,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model("Deck", deckSchema);
