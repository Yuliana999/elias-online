/*
  Express 4 не ловить помилки, які "падають" всередині async-функцій —
  проміс просто відхиляється, і запит зависає без відповіді. Ця обгортка
  ловить такий reject і передає його в next(err), звідки він потрапляє
  в загальний error-мідлвар у server.js.

  Використання: router.post("/register", asyncHandler(register));
*/
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
