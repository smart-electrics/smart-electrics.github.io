# Відтворення Manrope subsets

`source/` зберігає незмінні поточні variable WOFF2 Manrope; цей каталог лежить
під `scripts/`, який Jekyll виключає з публічної збірки. Ліцензію див. в
`assets/fonts/OFL-Manrope.txt`.

Генератор щоразу збирає production HTML у тимчасовий каталог і передає
`fontTools` лише кодові точки цього корпусу, які підтримує відповідний source
font. Він не інстанціює variable font, тому зберігає вісь `wght` 200–800.

```sh
python3 -m venv /tmp/smart-electrics-fonttools
/tmp/smart-electrics-fonttools/bin/pip install -r scripts/font-subsets/requirements.txt
/tmp/smart-electrics-fonttools/bin/python scripts/font-subsets/generate.py
node --test tests/unit/font_subset_contract.test.mjs
```
