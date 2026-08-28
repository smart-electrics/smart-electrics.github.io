# Візуальна перевірка: три стани електричного ядра

Статус: PASS — незалежна візуальна перевірка 2026-08-28.

## Межі перевірки

Перевіряються п’ять нових сімейств для трьох service studios:

- `electrical-design-plan` — план і прив’язка точок;
- `electrical-design-groups` — групи та навантаження;
- `electrical-installation-finish` — підключення виконаних ліній;
- `panel-intake` — ввід живлення;
- `panel-priorities` — розподіл і пріоритети.

Кожне сімейство отримало окремі `768×512` і `1536×1024` WebP. Незалежно
перевірено: різний зміст кожного стану в межах
одного маршруту, той самий інтер’єр і camera/lens language, фізично
правдоподібні траси, щит і сервісні зазори, відсутність людей, тексту,
логотипів, UI, випадкових кабелів, дубльованої фурнітури, зламаної геометрії
та неприродного bloom.

## Очікувана послідовність станів

| Маршрут | assembled | focus | reassembled |
| --- | --- | --- | --- |
| Проєктування електрики | `electrical-design-plan` | `electrical-design-groups` | `panel` |
| Електромонтаж | `electrical-installation` | `electrical-installation-finish` | `panel` |
| Щити та захист | `panel-intake` | `panel` | `panel-priorities` |

Повторно використані `electrical-installation` і `panel` уже мають provenance
та візуальний огляд у
[cinematic-engineering-scene-set](generated-assets.md#cinematic-engineering-scene-set)
і [smart-home-scenes-visual-qa.md](smart-home-scenes-visual-qa.md). Їх не
видають за нові генерації.

## Результат незалежної перевірки

PASS для набору та обох responsive-розмірів кожного family:

- `electrical-design-plan`: чітко показує причинний план і прив’язку точок;
  немає людей, брендів чи UI.
- `electrical-design-groups`: три окремі bays формують зрозумілу логіку груп.
- `electrical-installation-finish`: стіна повністю закрита, без ознак
  незавершеного rough-in.
- `panel-intake`: blank, vendor-neutral ввід із узгодженими провідниками та
  прозорою кришкою.
- `panel-priorities`: три фізично відокремлені яруси пояснюють розподіл і
  пріоритети без тексту або UI.

Для mobile збережено `768×512`, для desktop — `1536×1024`; перевірка не
виявила людей, брендів, читабельних написів, UI або видимих AI-slop дефектів.
Вихідні SHA-256 і розміри зафіксовано в
[generated-assets.md](generated-assets.md#electrical-core-three-state-scenes)
та `_data/production_assets.yml`.
