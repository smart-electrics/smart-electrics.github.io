# Фінальне приймання кінематографічного сайту

Цей документ описує локальний і CI gate для Issue #32. Він не підтверджує
реальні об'єкти, контакти, інтеграції або послуги. Перевірка стосується
згенерованого статичного сайту, його доступності та чесності публічної копії.

## Референси власника

- [AI Home Control Platform, Dribbble](https://dribbble.com/shots/27651031-AI-Home-Control-Platform)
- [Відеопрев'ю власника, 7.53 s](https://cdn.dribbble.com/userupload/48726055/file/2cb7b81475761199cd61ed6f172f85e9.mp4)

Референси потрібні для ручної оцінки ритму, масштабу сцени та причинного
зв'язку між дією і кадром. Відео, його кадри, текст і чужі активи не входять
до репозиторію. Візуальна родина Smart Electrics перевіряється окремо за
власними локальними WebP та provenance у docs/media/.

## Що має пройти

| Напрям | Доказ | Причина відмови |
| --- | --- | --- |
| Маршрути | 24 public routes, включно з /404.html | Невдалий HTTP-відповідь, відсутній main, dead internal link або інший lang |
| Розміри | 375×812, 414×896, 540×960, 768×1024, 900×900, 1024×768, 1280×900, 1440×1000, 1536×1000, 1720×1100, 1980×1200 px | documentElement.scrollWidth більший за clientWidth, обрізана недосяжна дія або зламаний layout; PNG має інші dimensions |
| Семантика | JS, no-JS і заблоковані adapters для всіх 20 dynamic routes | Звичайне посилання не працює, fallback прихований або enhancement потрібен для читання |
| Керування | pointer, Enter, touch і focus-visible | Disabled або inert control, target менший за 44 px, стан не змінює сцену, pixels, source або topology |
| Кінематографія | assembled, focus і reassembled для кожної stateful composition | Більше однієї видимої сцени або панелі, кадр занадто малий відносно композиції, немає зрозумілого зв'язку між control і scene |
| Геометрія | 20 composition routes × 6 widths × 3 settled states | Scene, panel або rail виходить за stage/composition, неконтрольовано перетинається, приховує overflow або лишає порожній хвіст |
| Motion | disassemble, hold, reassemble, idle з виміряними мінімальними фазами | Немає чистого hold, остання швидка дія не перемагає, конектор не пов'язаний із вибраним станом, text opacity/filter animation або motion не зупиняється для reduced motion |
| Доступність | Axe на початковому й кожному активному стані | Axe violation, невидимий focus, duplicated interactive content або snapshot без aria-hidden |
| Копія | source, built visible copy і runtime dynamic copy | Непідтверджена телеметрія, status, portal, account, remote control, vendor compatibility, ціна, гарантія, сертифікат, review або клієнтський проєкт як факт |
| Медіа | _data/production_assets.yml і pure Ruby parser | Missing, stale, orphan або semantic pair/provenance drift; WebP без перевірених bytes, hash і decoded dimensions |

Для резиденції дев'ять scene families мають лишатися явними: panel,
stairs, exterior, surveillance, audio, backup, climate, shading і diagnostics.
Room, stairs і exterior controls доводять зміну реального зображення через
currentSrc і pixel signature. У smart-home simulator перевіряються всі дев'ять
systems і сім presets, а не лише ARIA-стан.

Лише початкова smart-home сцена має серверні взаємовиключні mobile/desktop
`source`, потрібні для no-JavaScript режиму. Вісім прихованих сцен зберігають
URL як інертні data-атрибути. Після enhancement активна сцена отримує один
прямий URL відповідно до межі 768 px, а початковий candidate list прибирається.
Так Chromium не може спекулятивно запустити медіа прихованої сцени й потім
позначити його `net::ERR_ABORTED`. Acceptance перевіряє `currentSrc` кожної з
дев'яти сцен, відсутність unselected request і відсутність request failures.

## Evidence

tests/browser/final_acceptance.spec.js запускається один раз у project
final-acceptance. Він записує детерміновані JSON-підсумки, 28 representative
component-frame screenshots усіх кінематографічних composition families і
чотири smart-home component-frame screenshots для 375, 768, 1440 і 1980 px у
artifacts/final-evidence/. Перед кожним capture звичайної композиції її frame
детерміновано повертається до scene/control anchor; перевіряються межі
composition, scene, panel і control, а також їхня змістовна видима частина.
Smart-home frame окремо ставиться на початок simulator route section і
перевіряється за window scroll, simulator top та внутрішнім phone scroll;
interaction scroll не визначає жоден evidence-кадр. Кожен PNG декодується,
звіряється з точним viewport (зокрема 1980×1200) і повторюється у тому самому
settled стані; різний SHA-256 між двома capture є помилкою.

Pixel signatures динамічних smart-home станів знімаються як видимий
viewport-bounded page clip. Element screenshot для високої сцени тут не
використовується: Chromium може тимчасово розширити render surface під час
такого capture і створити штучний responsive media request, якого немає у
settled viewport. Request assertions лишаються строгими для фактичної ширини.

No-JavaScript fallback перевіряється на всіх одинадцяти acceptance widths.
Окремий adapter-outage прогін блокує site JavaScript і повторює всі 20 dynamic
routes на 375, 768, 1440 та 1980 px. Runtime claim scanner читає весь settled
body кожного з 24 public routes, включно з видимими поточними значеннями
input/textarea, а не лише main або інтерактивні компоненти.

Каталог ігнорується Git. У Quality workflow він завантажується лише після
успішного literal `make -f Makefile check`; відсутній каталог є помилкою workflow. Перед
handoff виконавець відкриває representative screenshots і перевіряє, що
motion не перетворив сцену на набір карток, не створив overlay artifact та не
сховав активну дію за межами viewport.

Hosted Quality має bounded budget 60 хвилин, `workers: 1` і `retries: 0`.
Попередній 45-хвилинний budget був недостатнім: Actions run `32884161387`
пройшов 639 із 648 тестів без test failure і був примусово скасований самим
workflow timeout. Timeout, скасування або незавантажений evidence artifact
залишають gate червоним; execution budget не дозволяє повторні спроби.

Наступний Actions run `32891310108` чесно зупинився на 643 успішних тестах:
три compact smart-home assets були перервані speculative parser на 1440 px, а
шестиширинний choreography test вичерпав стандартні 30 секунд під час
останньої штатної фази `disassemble`. Media lifecycle виправлено в runtime.
Для цього одного виміряного choreography test встановлено 45 секунд; policy
забороняє глобальний test timeout і будь-які неаудитовані scoped exceptions.
`actionTimeout: 10_000`, `workers: 1` та `retries: 0` лишаються незмінними.

## Локальний порядок

    make -f Makefile validate-production-assets
    make -f Makefile validate-public-claims
    node node_modules/@playwright/test/cli.js test tests/browser/final_acceptance.spec.js
    make -f Makefile check

Playwright retries завжди дорівнюють 0. `make -f Makefile check` є остаточним gate.
Будь-який failed test, missing evidence, skipped test, stale asset metadata
або ручний visual finding зупиняє delivery. Quality policy відхиляє
`skip`, `fixme`, `only`, `todo` та expected-failure annotations через
binding-aware AST аналіз, включно з computed, optional-property, escaped та
aliased формами. Playwright reporter і Node TAP wrapper додатково роблять
runtime червоним при будь-якому фактичному `skipped`, `todo` або expected-failure
результаті. Package scripts і Make recipes зафіксовані без `grep`, `project`,
`shard` чи інших selection arguments; Node wrapper відхиляє всі CLI options,
успадковані `NODE_OPTIONS`/`NODE_TEST_CONTEXT`, неповний TAP summary і нуль
виконаних тестів; повний Node suite додатково має повернути всі 65 зафіксованих
unit-тестів.
Кожен Ruby unit-файл проходить через окремий Minitest wrapper: ненульовий exit,
відсутній або дубльований summary, нуль запусків чи будь-який `skip` лишають gate
червоним. Для кожного файлу зафіксовано очікувані runs/assertions, а launcher
відхиляє preload-контроли до старту Ruby. npm install виконується з
`--ignore-scripts`, а package lifecycle hooks заборонені.
Playwright config має audited source digest, кожен project дозволяє лише свій
`viewport`, а runtime reporter вимагає рівно 648 discovered tests. Кожен Make
target має одне визначення; pattern/special rules, альтернативні default
makefiles, `.npmrc` і зовнішні includes заборонені.
Quality workflow має точну безумовну послідовність кроків і не допускає
`continue-on-error`, додаткових mutation-кроків, глобального `env:` або умовного
запуску `make -f Makefile check`. Make відхиляє успадковані execution controls і
динамічні top-level functions до виконання будь-якого target; Node та Playwright
gates запускаються прямими audited entrypoints без npm shell.
