# Реєстр згенерованих медіа

Цей файл зберігає походження, призначення та перевірку медіа, створених для
сайту. Він не є користувацькою AI-позначкою і не публікується Jekyll.

## control-room

- Дата: 2026-08-23
- Інструмент: вбудований OpenAI image generation tool
- Вхідні зображення: відсутні
- Призначення: фотореалістична hero-сцена готової до реалізації конфігурації
  освітлення й автоматизації приватного житлового простору
- Публічне твердження: візуальна концепція, не підтверджений клієнтський кейс
- Файли: `assets/images/home/control-room-768.webp`,
  `assets/images/home/control-room-1536.webp`
- Перетворення: WebP без метаданих, ширина 768 і 1536 px, `cwebp` quality 84 і
  86 відповідно

### Візуальна перевірка

- [x] У кадрі немає людей, облич, силуетів, рук або тварин.
- [x] Немає тексту, логотипів, брендів, watermark або інтерфейсних написів.
- [x] Вертикалі, дверні прорізи, стеля, меблі та світлові лінії мають узгоджену
  геометрію.
- [x] Світильники, вимикач і декоративні елементи не мають видимих деформацій.
- [x] Текстури дерева, каменю та тканини не містять помітних повторів.
- [x] Відбиття, тіні, температура світла й перспектива фізично правдоподібні.
- [x] Немає випадкових кабелів, дубльованих меблів, floating objects або
  надмірного bloom.

### Prompt

```text
Use case: photorealistic-natural
Asset type: production website hero image for Smart Electrics, a luxury electrical engineering and smart-home installation firm
Primary request: Create an ultra-realistic architectural photograph of a completed-looking contemporary private residence interior at blue hour, designed to demonstrate integrated lighting and electrical control. The image is a visual concept for a ready-to-implement configuration, not a documentary client case.
Scene/backdrop: An expansive open-plan living room in a high-end modern house. Dark walnut wall planes, honed warm-grey travertine, smoked glass, restrained brushed bronze and copper details. Integrated ceiling coves, wall washing, floor-level guide lights, one sculptural table lamp and carefully balanced architectural lighting. A discreet unbranded electrical control panel or switch plane may be visible, but no readable controls.
Subject: The interior and its layered lighting system. No people.
Style/medium: editorial architectural photography, physically plausible, natural material texture, high dynamic range without an artificial CGI look
Composition/framing: landscape 3:2 or 16:10. Rectilinear 24 mm architectural lens, eye-level camera, straight verticals, precise perspective. Keep the left third darker and calmer for website copy. Place the most expressive illuminated living area in the center-right. Preserve useful crop safety for a tall mobile crop.
Lighting/mood: deep near-black and warm tobacco shadows with amber practical light around 2700K, a trace of cool blue-hour exterior light, controlled highlights, realistic global illumination and reflections
Color palette: #040201, #59372A, #F6A45F, #F3E6E4, #AF5D38, #817D83, #D0B49C
Materials/textures: true wood grain scale, stone pores, clean glass reflections, brushed metal with subtle anisotropy
Constraints: no people, faces, silhouettes, hands, pets, text, letters, numbers, logos, brands, watermarks, UI overlays, phones, tablets, visible vendor products, fake awards, impossible floating objects. Architecture must be buildable. Lamps, switches, ceiling lines, furniture, doors and reflections must have correct geometry. No duplicated furniture or repeating textures. No warped straight lines, malformed fixtures, random cables, surreal reflections, over-smoothed CGI surfaces, exaggerated bloom or orange color cast.
```
