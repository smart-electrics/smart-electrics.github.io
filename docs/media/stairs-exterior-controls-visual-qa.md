# Незалежна перевірка physical-scene controls: сходи й exterior

- Дата: 2026-08-24
- Метод: 1536×1024 masters і responsive WebP переглянуті як дві незалежні
  scene families; image decode, dimensions, byte-size, SHA-256 і rendered
  browser source/pixel swap перевірені окремо.
- Результат: 6/6 станів PASS, 12/12 production WebP PASS. Немає людей,
  тексту, брендів, UI, watermark, warped geometry або style drift.

## Повторна перевірка SVG overlay — 2026-08-29

- Перевірена реалізація: `6071216` (`fix(#68): replace decorative routes with
  fixture glows`). Raster-файли й camera crop не змінювалися.
- Незалежний Chromium-перегляд виконано на 375, 1440 і 1980 px у normal та
  reduced motion. У кожному режимі послідовно перевірено всі шість станів:
  `stairs` off/route/full і `exterior` approach/evening/reduced-night.
- На сходах локальні поля збігаються з правими вбудованими світильниками й не
  утворюють окремих плям посередині проступів. У exterior поля залишаються біля
  bollard, step-wash і entry-canopy джерел. Декоративних маршрутів, HUD-ліній,
  `path`, `line` або `polyline` немає. Видимих AI-артефактів чи розриву стилю не
  виявлено.
- Детермінований browser loop: 36/36 state/viewport/motion комбінацій PASS;
  runtime errors `0`, horizontal overflow `0`, transition residue `0`. Активні
  WebP і SVG signatures збігалися після кожної взаємодії.

| Family | Стани | Continuity / finding |
| --- | --- | --- |
| stairs | off → route → full | Та сама camera, treads, rail і landing; тільки route/циркуляційне світло змінює фізичну сигнатуру. PASS. |
| exterior | approach → evening → reduced night | Та сама gate/path/facade geometry; тільки групи підходу, ландшафту й нічного зниження змінюються. PASS. |

SSIM проти approved base для edit-only states (світлова зміна очікувана):
stairs off `0.8615`, route `0.8859`; exterior approach `0.7666`, reduced night
`0.7460`. `stairs-full` та `exterior-evening` — exact approved-base copies.

| Файл | Розмір, bytes | SHA-256 |
| --- | ---: | --- |
| stairs-off-1536.webp | 1536×1024, 25282 | `756bc029c041504718b4c0a5720f09c44bf4cd21818ea7611d9e03ad5aba20e7` |
| stairs-off-768.webp | 768×512, 7016 | `2e2293a5de64c48ed24f9475706bcf3d33259dad05cd200cb752354022a79bdf` |
| stairs-route-1536.webp | 1536×1024, 35132 | `ee9eee43c182e20cc71426c08ec58d37fa90070e785cb4649a11775d782a00dc` |
| stairs-route-768.webp | 768×512, 10306 | `e38c1e43f2df267f66089a0765e943014f9dae610150d7241085e7abc2d1974c` |
| stairs-full-1536.webp | 1536×1024, 72584 | `2e22c9ae3c4e4eec2e3ad9b6a2f030f19f55bc8005764a41ec695de9d461392d` |
| stairs-full-768.webp | 768×512, 19226 | `6eb9cabca2e823246667be5198b0794e1f5f1c6b76aba5c60a5d15f257b70d07` |
| exterior-approach-1536.webp | 1536×1024, 81996 | `59ae8cbff06df69f6c25af6c79a448a2369a11609eedb5c1ac2acbf3497bc048` |
| exterior-approach-768.webp | 768×512, 26906 | `dd8f868b5786bdf2c1cea53bb89f50e042c66725ff88c5202c2cf145cef09047` |
| exterior-evening-1536.webp | 1536×1024, 231086 | `2e10c613fa1522b5d964e85957ef72979811336fdfc443fce20ec98ab7c2dbdc` |
| exterior-evening-768.webp | 768×512, 60738 | `fd10554c0093ccde83c50055b1bd8af619c0348586f6a1ab3dc85a234d277d6f` |
| exterior-reduced-night-1536.webp | 1536×1024, 86590 | `f005f30efb74e8d6f5f18c1009040eebdb55a9b6ed6bb3c5c62939e92d4785ef` |
| exterior-reduced-night-768.webp | 768×512, 23068 | `a86a3bac0676e1753bc96bf15e7b94740db90518ac116a16838e070655c483d5` |

Browser acceptance independently confirms the source and canvas-pixel signature
change for route stairs and reduced-night exterior on `/`, `/services/`, and
the subordinate `/smart-home/` scene without changing the canonical nine-system
phone. Production WebP carries no provenance metadata by design; source
provenance is recorded in [`generated-assets.md`](generated-assets.md).
