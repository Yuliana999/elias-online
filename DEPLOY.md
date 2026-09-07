# Деплой Eliass Online на Render — покроково

Все (і бекенд, і фронтенд) виставляємо на Render, одним "Blueprint"-деплоєм
через файл `render.yaml` в корені репозиторію.

## Що вже готово в цьому архіві
- Нові справжні `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (замість
  `change_me_...`) — лежать у `backend/.env`.
- `backend/.env.example` доповнено коментарями під продакшн.
- `render.yaml` — описує одразу два сервіси: `elias-backend` (Web Service)
  і `elias-frontend` (Static Site). Вони самі "знаходять" домени одне
  одного через `${service.url}` — вручну прописувати CLIENT_ORIGIN і
  VITE_API_URL не треба.

`node_modules` в архіві немає (він завжди генерується заново на білді) —
для локального запуску виконай `npm run install:all` в корені.

## 1. Залий проєкт на GitHub

Переконайся, що `.env` НЕ потрапив у коміт — `.gitignore` вже це блокує,
перевір командою `git status` перед першим комітом.

## 2. MongoDB Atlas — дозволь доступ ззовні

Atlas → Network Access → Add IP Address → `0.0.0.0/0` (allow from anywhere).
Без цього кроку Render не достукається до бази — з'явиться той самий
"bad auth" або таймаут підключення.

## 3. Render → New → Blueprint

1. render.com → New → Blueprint → вибираєш свій GitHub-репозиторій.
2. Render прочитає `render.yaml` і запропонує створити ОБИДВА сервіси
   одразу: `elias-backend` і `elias-frontend`.
3. Перед першим Apply Render попросить вручну ввести значення для
   змінних з `sync: false` (Render не зберігає секрети в git):

   | Сервіс | Змінна | Значення |
   |---|---|---|
   | elias-backend | `MONGODB_URI` | `mongodb+srv://barnayuliana999_db_user:BearsCat@cluster0.zja09fa.mongodb.net/?appName=Cluster0` |
   | elias-backend | `JWT_ACCESS_SECRET` | значення з `backend/.env` |
   | elias-backend | `JWT_REFRESH_SECRET` | значення з `backend/.env` |

4. Натискаєш Apply. Render задеплоїть спершу `elias-backend`, потім
   `elias-frontend` (саме тому backend вище у `render.yaml`) і сам
   підставить домени одне одному в `CLIENT_ORIGIN` і `VITE_API_URL`.

## 4. Перевір

Відкриваєш URL сервісу `elias-frontend` (виду
`https://elias-frontend.onrender.com`) — сайт має відкритись і працювати
з бекендом без помилок CORS чи `bad auth`.

## Якщо щось пішло не так

- **CORS-помилка в консолі браузера** — зайди в `elias-backend` →
  Environment, перевір що `CLIENT_ORIGIN` дійсно містить домен
  фронтенда (з `https://`, без `/` в кінці).
- **Фронтенд стукається на localhost:4000** — значить `VITE_API_URL` не
  підхопився під час білда. Зроби Manual Deploy → Clear build cache &
  deploy для `elias-frontend`.
- **Free-план "засинає"** — безкоштовні Render-сервіси засинають після
  ~15 хв без запитів і перший запит після сну обробляється довше (десь
  30-60 сек), це нормально для free tier, не помилка.
