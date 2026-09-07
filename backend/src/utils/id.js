const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Той самий формат ID, що вже використовує фронтенд-мок (genId у App.jsx),
// щоб бекенд не ламав очікування UI.
export function genPublicId(length = 6) {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return s;
}

export async function genUniquePublicId(Model, field = "publicId") {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = genPublicId();
    const exists = await Model.exists({ [field]: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Не вдалося згенерувати унікальний ID, спробуйте ще раз");
}

// Той самий генератор коду, що й для publicId (той самий алфавіт/довжина),
// але з унікальністю в межах колекції Lobby — код лобі гравці вводять,
// щоб приєднатись до конкретної кімнати.
export async function genUniqueLobbyCode(Model, field = "code") {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = genPublicId();
    const exists = await Model.exists({ [field]: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Не вдалося згенерувати унікальний код лобі, спробуйте ще раз");
}
