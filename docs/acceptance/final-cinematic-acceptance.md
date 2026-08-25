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

No-JavaScript fallback перевіряється на всіх одинадцяти acceptance widths.
Окремий adapter-outage прогін блокує site JavaScript і повторює всі 20 dynamic
routes на 375, 768, 1440 та 1980 px. Runtime claim scanner читає весь settled
body кожного з 24 public routes, включно з видимими поточними значеннями
input/textarea, а не лише main або інтерактивні компоненти.

Каталог ігнорується Git. У Quality workflow він завантажується лише після
успішного literal make check; відсутній каталог є помилкою workflow. Перед
handoff виконавець відкриває representative screenshots і перевіряє, що
motion не перетворив сцену на набір карток, не створив overlay artifact та не
сховав активну дію за межами viewport.

## Локальний порядок

    make validate-production-assets
    make validate-public-claims
    npx playwright test tests/browser/final_acceptance.spec.js
    make check

Playwright retries завжди дорівнюють 0. make check є остаточним gate.
Будь-який failed test, missing evidence, skipped test, stale asset metadata
або ручний visual finding зупиняє delivery.
