# Незалежна перевірка physical-scene controls

- Дата: 2026-08-24
- Reviewer: Luna, незалежна роль visual QA
- Метод: усі 20 combined plates переглянуто незалежно в оригінальній
  1536×1024 роздільності; перші 8 plates уже мали незалежний PASS, а всі 12
  додані combined plates окремо перевірені як 12/12 PASS. Representative
  states також переглянуті з root. Окремо виконано `dwebp` decode,
  dimensions/byte-size/SHA-256 і `webpmux -info` metadata pass для 40 WebP.
- Результат: 20/20 source combinations PASS; 40/40 production WebP PASS.
- Findings: blocker-free, S0 для всього набору.

## Coverage

| Lighting family | Перевірено | Finding |
| --- | ---: | --- |
| `off` / Вимкнено | 5/5 PASS | Освітлення вимкнене послідовно; одна camera/crop family, архітектура, меблі та матеріали стабільні. |
| `route` / Маршрут | 5/5 PASS | Маршрутне світло змінює видиму світлову сигнатуру без зміни anchor, геометрії чи camera crop. |
| `evening` / Вечір | 5/5 PASS | Тепле вечірнє освітлення та blue-hour ambience узгоджені між усіма window treatments. |
| `full` / Повне | 5/5 PASS | Повний світловий стан читається як найбільш освітлена версія тієї самої кімнати; немає style drift. |

| Window-treatment family | Перевірено | Finding |
| --- | ---: | --- |
| `open` / Відкрито | 4/4 PASS | Відкрите скління, рами та зовнішня blue-hour експозиція залишаються фізично послідовними. |
| `tulle` / Тюль | 4/4 PASS | Прозора тканина має правдоподібні складки, трек і пропускання світла. |
| `blinds` / Жалюзі | 4/4 PASS | Ламелі та їхні тіні мають послідовну орієнтацію й реалістичну взаємодію зі світлом. |
| `blackout` / Blackout-ролети | 4/4 PASS | Непрозорі panels правдоподібно блокують зовнішнє світло; монтажна геометрія стабільна. |
| `curtains` / Штори | 4/4 PASS | Закриті штори мають фізично правдоподібну ширину, складки, падіння й track geometry. |

У всіх 20 кадрах camera/crop/architecture/furniture/material continuity стабільні.
Людей, силуетів, тварин, тексту, логотипів, брендів, watermark, UI та очевидних
AI-артефактів не виявлено. Усі п'ять window treatments залишаються фізично
правдоподібними в `off`, `route`, `evening` і `full`.

## Production WebP manifest

Команди production conversion: `cwebp -m 6 -q 88 -metadata none` для desktop
та `cwebp -m 6 -q 86 -resize 768 512 -metadata none` для mobile. Бюджет кожного файлу:
desktop ≤250000 bytes; mobile ≤75000 bytes. Усі WebP
мають dimensions 1536×1024 або 768×512 відповідно, декодуються через `dwebp`,
і не містять WebP metadata (`webpmux -info`: `No features present.`).
Максимальний фактичний розмір: 212758 bytes desktop
(`room-full-open-1536.webp`) і 46446 bytes mobile
(`room-full-blinds-768.webp`).

| Стан | Файл | Розмір | Bytes | SHA-256 | Результат |
| --- | --- | ---: | ---: | --- | --- |
| off / open | `room-off-open-1536.webp` | 1536×1024 | 70796 | `e812cbb3d02f9d56171c795f00a269c1d108611ec8cb88928bd155ffd30cbb08` | PASS |
| off / open | `room-off-open-768.webp` | 768×512 | 19218 | `ab56e4ba564d9497cfd71c7ee08fc16b3331dcac1ad03f94d2f48402dc1fc029` | PASS |
| off / tulle | `room-off-tulle-1536.webp` | 1536×1024 | 57994 | `7dcf1319e3b4ca930386a55c1d1503f027195b3429a2b9d2ff9b8175872ef71c` | PASS |
| off / tulle | `room-off-tulle-768.webp` | 768×512 | 16324 | `14f7fae2444988de24024a46922fecc6ab163ec25afe14415d958cb44507a2f0` | PASS |
| off / blinds | `room-off-blinds-1536.webp` | 1536×1024 | 73182 | `c0c83c243bf5540336d6c9c96ab4a36c77a0ebc560f84e382a6d7362abc26b2a` | PASS |
| off / blinds | `room-off-blinds-768.webp` | 768×512 | 21036 | `04ec43a496bf2acf2dce1e444c5b906294d723c3f883b8d86540bcd1cc3d252a` | PASS |
| off / blackout | `room-off-blackout-1536.webp` | 1536×1024 | 21964 | `a06ed6c66b3e2422dd42dcd9dae860d06436cb644244de26585b3aa20d3003e6` | PASS |
| off / blackout | `room-off-blackout-768.webp` | 768×512 | 6090 | `c6d98e66feda5a0ef3c34bb1ac6f5e9b47ba0f805689d04560e4102ea28287d6` | PASS |
| off / curtains | `room-off-curtains-1536.webp` | 1536×1024 | 31260 | `f3793863a4a278fcc12adbd56efa240520108b65cea07d77dfeda00fe74d87d6` | PASS |
| off / curtains | `room-off-curtains-768.webp` | 768×512 | 9634 | `b2e39cec634fca598ae7620bcc0b3780e30e2b460472e1ea430e989cfa0c1037` | PASS |
| route / open | `room-route-open-1536.webp` | 1536×1024 | 73630 | `3ee6b7c2bc6e394e9e69a0c0eb50f56b9e96e0e515be5a47d3c06d2f20ab4166` | PASS |
| route / open | `room-route-open-768.webp` | 768×512 | 18822 | `fa76444be70068266f0ba8f7c7eef47ebf3b8fbe40308eed21aac1ba5bef58e0` | PASS |
| route / tulle | `room-route-tulle-1536.webp` | 1536×1024 | 81282 | `e3a4c67810d167454db5ac5658d1371c672990ba85088df41707e2098c6e300f` | PASS |
| route / tulle | `room-route-tulle-768.webp` | 768×512 | 23516 | `8d6611fa724ff5bc58fd038bad2c62dc95c1a02c4fb2ed1a1ae6d43130318552` | PASS |
| route / blinds | `room-route-blinds-1536.webp` | 1536×1024 | 82644 | `cbc549112dbb32a95bfddcc86eada3daf92d6de3303e060443f62d4780b78e85` | PASS |
| route / blinds | `room-route-blinds-768.webp` | 768×512 | 22802 | `b98fd1152267fb4a407d40d0c75bef2c2c3f0ccab30446adaa7f97a18d118611` | PASS |
| route / blackout | `room-route-blackout-1536.webp` | 1536×1024 | 43014 | `97383551e310bc2d9b80b6cc99360a613ef3d55416e1057e426be2f1afb03a72` | PASS |
| route / blackout | `room-route-blackout-768.webp` | 768×512 | 11854 | `405eeeab53e92bffaa9146b613fb344da9aa052c9471227e02c1c9f70d783fb6` | PASS |
| route / curtains | `room-route-curtains-1536.webp` | 1536×1024 | 51400 | `9eef020f7cf7e3c5dcc23612ba78abcd5b8c3dda8386565c6a2927f2143c640b` | PASS |
| route / curtains | `room-route-curtains-768.webp` | 768×512 | 14928 | `1530e8ad9c1370d65639ece741273f9108a8084ae6ab5b32c95eedf3c0a93fea` | PASS |
| evening / open | `room-evening-open-1536.webp` | 1536×1024 | 142240 | `aaa5d79e37de71175a347c9863b0f05d20e4a744ac4d5ad75a3e168bed54b382` | PASS |
| evening / open | `room-evening-open-768.webp` | 768×512 | 32894 | `0d9dd5426de67d27d01cef5f5991afd31774e3e6572110d0cf074469c9eb5ec0` | PASS |
| evening / tulle | `room-evening-tulle-1536.webp` | 1536×1024 | 104986 | `1211c5ed22c624c057e5386729be10b71222027025774e5fc6ee8316ffeb3319` | PASS |
| evening / tulle | `room-evening-tulle-768.webp` | 768×512 | 30026 | `e0ffcc1eeff594ff9511f56e9e24cd6d42af9f7433f4a7cb6ba5925694ba2cf1` | PASS |
| evening / blinds | `room-evening-blinds-1536.webp` | 1536×1024 | 120206 | `82d15dee28cad85e01050bb129ac4374ef25ff89a129868eab0e6728af381e83` | PASS |
| evening / blinds | `room-evening-blinds-768.webp` | 768×512 | 33174 | `be9b91819fc8998dfe5334a0dd727d2a745bed8321f307dc96e42ef6b6e967a2` | PASS |
| evening / blackout | `room-evening-blackout-1536.webp` | 1536×1024 | 69360 | `ed4eb4426186f6dbf04b53ad7fcbef853806e9797d83582a8ed949ef34577aa0` | PASS |
| evening / blackout | `room-evening-blackout-768.webp` | 768×512 | 18668 | `62768c4af4c14f0a331e9cba3157585447cdebdab9592c1e3ccb7e6676bfda6e` | PASS |
| evening / curtains | `room-evening-curtains-1536.webp` | 1536×1024 | 95332 | `93a489a7b35057ef0dc8c8248d9ef29ffab5f7e4acc27e00d78535dd9fd9ac62` | PASS |
| evening / curtains | `room-evening-curtains-768.webp` | 768×512 | 26022 | `3a7490b35d939ef1e7f3f2b29f736e4cbb2e8c0b890482f462cedeefda5e8e8b` | PASS |
| full / open | `room-full-open-1536.webp` | 1536×1024 | 212758 | `1add01368b74d90d236012e963bbbc7762555fb2c62abd5ffde7f2da4702f799` | PASS |
| full / open | `room-full-open-768.webp` | 768×512 | 46208 | `b8af09b4475c52c1d5c2093bda2c65fe7aa260ff1837bf0813f2bd27b28d1381` | PASS |
| full / tulle | `room-full-tulle-1536.webp` | 1536×1024 | 162898 | `d243325e82143057f7013cab3a54a2a811b7e296b5c64133b3ebf91490bce212` | PASS |
| full / tulle | `room-full-tulle-768.webp` | 768×512 | 43658 | `dbdaf7efd67eb0407b6f5a1a97f5733d453b98b6c8a2904c0a5d50de9c0acdff` | PASS |
| full / blinds | `room-full-blinds-1536.webp` | 1536×1024 | 183980 | `d12700f399d1e92900378791aceae1cdbffa4349a436a118c3bf821fe8673b80` | PASS |
| full / blinds | `room-full-blinds-768.webp` | 768×512 | 46446 | `fb45983183a255214c115da7ddce5175c3722876386edf820df90ae16f0af12f` | PASS |
| full / blackout | `room-full-blackout-1536.webp` | 1536×1024 | 119674 | `4a716fcecc1cf4dd88bbdb0080eca535f842765fb61716fbde837615fdbd40d0` | PASS |
| full / blackout | `room-full-blackout-768.webp` | 768×512 | 28022 | `766660e30a3a0f440fae913657c612c17c62c543074b9aa695680c70d1ab58af` | PASS |
| full / curtains | `room-full-curtains-1536.webp` | 1536×1024 | 143584 | `58676def92289d8ae1bb78dbeef96b45dd04245d551e1aef942452fc30344c3e` | PASS |
| full / curtains | `room-full-curtains-768.webp` | 768×512 | 37170 | `8eb97336f7660990a5127d980299947259111a8f6391869b1cff73cfdedaeec7` | PASS |

## Validation boundaries

The visual PASS covers the generated raster set and its responsive output. It
does not claim a confirmed client installation, building documentation, product
certification, or compatibility with a specific vendor. Source PNG provenance
is recorded in [`generated-assets.md`](generated-assets.md); the production
WebP intentionally has no metadata.
