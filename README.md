# Smart Electrics

Підготовча версія офіційного сайту Smart Electrics — електричні системи для
житлових і комерційних просторів у Львові та області, від проєктування й
чорнового монтажу до розумного будинку.

Сайт навмисно опубліковано як `noindex`. Підтверджений редизайн передбачає
ліцензовані та згенеровані фотореалістичні візуалізації для «Готових рішень» —
готових до реалізації конфігурацій; розділ підтверджених проєктів лишається
поза навігацією до появи матеріалів. Formspree та GA4 не активуються, доки
власник не надасть потрібні реквізити й умови обробки даних.

## Технології

- Jekyll 4.4 із власною збіркою в GitHub Actions;
- SCSS та vanilla HTML/Liquid без клієнтського framework;
- Playwright + axe для responsive та accessibility перевірок;
- pure Ruby перевірки інвентарю production WebP і публічних тверджень;
- HTMLProofer для згенерованих сторінок і внутрішніх посилань;
- GitHub Pages за адресою <https://smart-electrics.github.io/>.

## Локальний запуск

Потрібні Ruby `3.4.10`, Bundler `4`, Node `24.16.0` і npm `11` або новіший у
межах Node 24. Версії зафіксовано у `.ruby-version`, `.nvmrc`, `Gemfile.lock` та
`package-lock.json`.

```bash
make install
make serve
```

Jekyll відкриється на `http://127.0.0.1:4000`. Повна перевірка перед PR:

```bash
make -f Makefile check
```

Окремі команди можна переглянути через `make -f Makefile help`.

## Структура

- `_services/` — вісім узгоджених маршрутів послуг;
- `_layouts/`, `_includes/`, `_sass/` — Jekyll UI та дизайн-система;
- `tests/browser/` — контракти маршрутів, viewport і доступності;
- `scripts/validate_integrations.rb` — fail-closed guard для GA4 та Formspree;
- `docs/acceptance/final-cinematic-acceptance.md` — рубрика фінального visual і behavioral acceptance;
- `docs/adr/`, `CONTEXT.md` — рішення та єдина доменна мова;
- `.agents/skills/`, `.codex/` — версіоновані skills і multi-agent ролі.

## Інтеграції

Поточні значення в `_config.yml` мають залишатися порожніми, доки інтеграцію
вимкнено. Для ввімкнення Formspree потрібні перевірений endpoint, реальні email
і телефон та фінальна політика конфіденційності. Для GA4 потрібні валідний
Measurement ID і та сама фінальна політика. `make validate` блокує неповну або
передчасно staged конфігурацію.

## Робочий процес

Bootstrap є єдиним прямим комітом у `main`. Подальші зміни проходять GitHub
Issue → гілка → PR → незалежний review. Режим локального acceptance, GitHub
workflows і merge gate визначає `docs/agents/workflow.md`; почніть з
`AGENTS.md`.

Project-local skills, точні upstream revisions і процедура оновлення описані в
`.agents/README.md`. Ліцензії сторонніх skills наведені в
`THIRD_PARTY_NOTICES.md`; код, дизайн і контент сайту — all rights reserved.
