# TODO: Google Drive вход + публикуване в GitHub Pages

Целта е тракерът да е публичен сайт в GitHub Pages, където всеки може да влезе с Google
акаунт и прогресът му да се пази автоматично в неговия Google Drive. **Кодът вече е готов**
(commit `e943a38`). Остава само настройка в Google Cloud и GitHub плюс една промяна в
конфигурацията. Този файл е написан така, че друг агент или човек да може да продължи
без допълнителен контекст.

## Чеклист

Отбелязано е кой какво може да направи: 👤 = само човек в браузъра (Google Console няма
CLI/API за тези стъпки), 🤖 = агент с `gh`/`git` в терминала.

- [x] **0. 👤 Решение:** GitHub акаунтът е `Maglata`.
- [x] **1. 🤖 GitHub:** публичното репо е създадено, кодът е push-нат и Pages е включен с GitHub Actions.
- [ ] **2. 👤 Google Cloud:** проект + включен Google Drive API
- [ ] **3. 👤 Google Cloud:** Branding (екранът за вход)
- [ ] **4. 👤 Google Cloud:** Data Access → scope `drive.appdata`
- [ ] **5. 👤 Google Cloud:** OAuth Client ID (Web application) с двата origin-а
- [ ] **6. 🤖 Репо:** Client ID в `public/js/config.js`, commit, push (Pages се обновява автоматично)
- [ ] **7. 👤 Google Cloud:** Audience → **Publish app** (за да може всеки да влиза без списък с имейли)
- [ ] **8. 👤+🤖 Проверка** на живия сайт (виж „Проверка“)

Адресът вече е известен: `https://maglata.github.io/acnh-tracker/`. Използвай го в стъпки 3
и 5. Origin-ът за Google OAuth е `https://maglata.github.io` (без път и без `/` накрая).

---

## Какво вече е направено (контекст за агента)

| Файл | Роля |
| --- | --- |
| `public/js/config.js` | `window.ACNH_CONFIG = { googleClientId: '' }`. **Единственото място, което трябва да се попълни.** Празно → бутонът за Google е скрит. |
| `public/js/drive.js` | Drive REST клиент: един файл `acnh-progress.json` в `appDataFolder`. Създава с multipart `POST`, после само `PATCH`. |
| `public/js/app.js` (секция „Google Drive sync“) | Google Identity Services *token model* (`google.accounts.oauth2.initTokenClient`), зарежда `https://accounts.google.com/gsi/client` динамично. Токенът се пази в `sessionStorage` (~1 час). Синхронизира 1 s след всяка промяна и при връщане в таба. |
| `public/js/logic.js` → `mergeStates` | Трипосочно сливане по същество спрямо последната синхронизирана версия (`localStorage['acnh-tracker-drive-base']`). Ново устройство никога не изтрива прогреса в Drive. |
| `public/privacy.html` | Политика за поверителност (Google я иска за публикуване). |
| `.github/workflows/pages.yml` | При push в `main`: `npm test` → публикува папка `public/` в GitHub Pages. |
| `test/drive.test.mjs`, `test/logic.test.mjs` | Тестове за Drive клиента (фалшив API) и сливането. `npm test` (Node 20+, без зависимости). |

Технически факти, важни за настройката:
- Scope: **`https://www.googleapis.com/auth/drive.appdata`**. Google го класифицира като
  **non-sensitive** ([източник](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)),
  затова не е нужно ревю/security assessment. Приложението вижда **само** собствения си скрит файл.
- Няма backend и **няма client secret**. Client ID-то е публично и стои в кода.
- Google вход работи само от `http://localhost` или `https://`. Не работи при отваряне на
  `index.html` като `file://`.
- Всички пътища в сайта са относителни, така че работи и под `https://<user>.github.io/acnh-tracker/`.
  Заявката към `/api/progress` (локалния Node сървър) в GitHub Pages връща 404 и
  приложението тихо минава на запис в браузъра. Това е очаквано.

---

## Предварителни условия

1. **GitHub акаунт.** Репото е създадено в `Maglata/acnh-tracker`.
   - Ако акаунтът е част от Enterprise Managed Users (EMU), Pages може да е забранен или да е
     само частен. Тогава задължително трябва личен акаунт.
   - Репото е публично, а Pages deployment-ът е настроен на GitHub Actions.
2. **GitHub CLI.** `gh` е инсталиран, влязъл е в акаунта `Maglata`, и има разрешение `workflow`.
3. **Google акаунт**, с който ще се управлява проектът в Google Cloud. Безплатно е, не иска
   карта за плащане. Всички настройки са през уеб конзолата.

---

## Стъпка 1 — GitHub репо и Pages (🤖)

Завършено:
- **Репо:** <https://github.com/Maglata/acnh-tracker> (публично, branch `main`).
- **GitHub Pages:** <https://maglata.github.io/acnh-tracker/>.
- **Workflow:** `.github/workflows/pages.yml`; първият deploy завърши успешно и `npm test` мина
  (17/17).
- **Проверка:** сайтът се зарежда. Google OAuth Client ID още не е настроен, затова бутонът за
  вход е скрит и Drive синхронизацията не е готова.

За следващите стъпки:
- **Адрес на сайта:** `https://maglata.github.io/acnh-tracker/`
- **Origin за Google:** `https://maglata.github.io` (без път и без `/` накрая)

---

## Стъпка 2 — Google Cloud проект + Drive API (👤)

1. https://console.cloud.google.com/projectcreate → **Project name:** `ACNH Tracker` → **Create**.
2. **Горе в лентата избери новия проект.** Всички следващи линкове работят в текущо избрания проект.
3. https://console.cloud.google.com/apis/library/drive.googleapis.com → **Enable**.

## Стъпка 3 — Branding / екран за вход (👤)

https://console.cloud.google.com/auth/branding (ако има **Get started**, мини през съветника)

| Поле | Стойност |
| --- | --- |
| App name | `ACNH Tracker` |
| User support email | имейлът на собственика |
| Audience | **External** |
| Developer contact email | имейлът на собственика |
| App logo | **Остави празно.** Логото задължава проверка на марката, която отнема дни. |
| Application home page | `https://<owner>.github.io/acnh-tracker/` |
| Application privacy policy link | `https://<owner>.github.io/acnh-tracker/privacy.html` |
| Authorized domains | `<owner>.github.io` |

`github.io` е в Public Suffix List, затова `<owner>.github.io` се приема като собствен домейн.

## Стъпка 4 — Data Access / scope (👤)

https://console.cloud.google.com/auth/scopes → **Add or remove scopes** → в полето
„Manually add scopes“ постави:

```
https://www.googleapis.com/auth/drive.appdata
```

→ **Add to table** → **Update** → **Save**. Трябва да се появи в секцията
**Your non-sensitive scopes**. Ако е в „sensitive“ или „restricted“, scope-ът е грешен.

## Стъпка 5 — OAuth Client ID (👤)

https://console.cloud.google.com/auth/clients → **Create client**

| Поле | Стойност |
| --- | --- |
| Application type | **Web application** |
| Name | `ACNH Tracker Web` |
| Authorized JavaScript origins | `http://localhost:4747` и `https://<owner>.github.io` |
| Authorized redirect URIs | **празно** (token model с popup не ползва redirect) |

→ **Create** → копирай **Client ID** (`123456789-xxxx.apps.googleusercontent.com`).
**Client secret не трябва никъде.** Не го слагай в репото.

Правила за origin-ите: схема + хост (+ порт), **без път и без `/` накрая**. Промените
понякога влизат в сила след 5 минути до няколко часа.

## Стъпка 6 — Client ID в кода (🤖)

```js
// public/js/config.js
window.ACNH_CONFIG = {
  googleClientId: '123456789-xxxx.apps.googleusercontent.com',
};
```

```sh
npm test
git commit -am "Configure Google OAuth client ID" && git push   # Pages се публикува автоматично
```

Локална проверка: `npm start` → http://localhost:4747 → вдясно горе трябва да има бутон
**Sign in with Google**.

## Стъпка 7 — Публикуване на приложението в Google (👤)

https://console.cloud.google.com/auth/audience → **Publish app** → **Confirm**. Статусът става
**In production**.

- Докато е в **Testing**, могат да влизат само имейлите, добавени в **Test users** (до 100).
- С non-sensitive scope и без лого не е нужна проверка от Google. Ако все пак се появи
  „Google hasn't verified this app“, потребителят натиска **Advanced → Go to ACNH Tracker**.

---

## Проверка (стъпка 8)

На `https://<owner>.github.io/acnh-tracker/`:

1. Иконите се зареждат, табовете Fish/Bugs/Deep-sea работят, Export/Import работят.
2. **Sign in with Google** → popup → избор на акаунт → съгласие за „See, create, and delete
   its own configuration data in your Google Drive“ → статус **☁️ Synced to Google Drive**.
3. Отметни нещо, изчакай около 2 s, после отвори сайта в друг браузър или в инкогнито и влез
   със същия акаунт. Отметката трябва да се появи.
4. Файлът в Drive: https://drive.google.com/drive/settings → **Manage apps** → ACNH Tracker
   трябва да показва „hidden app data“.
5. Затвори таба и отвори пак → бутон **Reconnect Google** → един клик → синхронизира.

## Чести грешки

| Симптом | Причина / решение |
| --- | --- |
| Бутонът за Google не се показва | `googleClientId` е празен, или сайтът е отворен като `file://`. |
| `Error 400: origin_mismatch` / `redirect_uri_mismatch` | Origin-ът на сайта не е в Authorized JavaScript origins (стъпка 5) или още не е влязъл в сила. |
| `Error 403: access_denied`, „app is being tested“ | Приложението е в Testing (стъпка 7 не е направена), а акаунтът не е в Test users. |
| `⚠️ Google Drive sync failed`, в конзолата 403 „Drive API has not been used in project“ | Drive API не е включен (стъпка 2) в **същия** проект, в който е Client ID-то. |
| `⚠️ Please allow access to Google Drive…` | Потребителят е махнал отметката за Drive в екрана за съгласие. Да влезе пак и да я остави. |
| Popup-ът не се отваря | Блокиран е от браузъра. Разреши popups за сайта. |

## Официална документация

- Drive appDataFolder: https://developers.google.com/workspace/drive/api/guides/appdata
- Drive scopes (sensitivity): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Identity Services, token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- OAuth consent / verification: https://support.google.com/cloud/answer/13463073
- GitHub Pages с Actions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
