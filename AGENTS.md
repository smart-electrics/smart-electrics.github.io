# Smart Electrics

## Working agreement

- Спілкуйся й пиши користувацький контент українською. Для hero-сцени та «Готових рішень» дозволені ліцензовані й згенеровані візуалізації без людей і без видимої AI-позначки; описуй їх як візуальні концепції або готові до реалізації конфігурації, а не як підтверджені клієнтські кейси. Не вигадуй сертифікати, ціни, строки, гарантії, адреси, відгуки чи можливості.
- Сценарні медіа випускай як одну перевірену візуальну родину: та сама резиденція, матеріали, camera/lens language, blue hour і 2700K amber/copper; без людей, брендів, написів та вбудованого UI. Для кожної сцени потрібні responsive-пара, provenance у `docs/media/generated-assets.md` і незалежний visual QA; green-тести не перекривають видимий AI-slop, зламану геометрію або стильовий розрив.
- Спершу прочитай `CONTEXT.md`; перед роботою з Issue — `docs/agents/issue-tracker.md` і `docs/agents/triage-labels.md`; перед зміною архітектури — релевантні ADR у `docs/adr/`.
- Веди роботу через GitHub Issue → гілка → PR після bootstrap. Не переписуй історію: без force-push. Ручний review або approval власника не потрібен; перед злиттям PR виконай автономний merge gate з `docs/agents/workflow.md`.
- Незакріплені зміни інших людей не чіпай. Перевірки й команди виводь із поточних файлів проєкту, а не з цього документа.
- Перед handoff або PR прочитай `docs/agents/workflow.md`: він визначає локальний acceptance, режим GitHub workflows і merge gate. Канонічна команда починається з незалежного policy preflight; не запускай лише `make check`. Playwright retries завжди `0`.

## Agent skills

### Issue tracker

Робочі запити ведемо в GitHub Issues. Див. `docs/agents/issue-tracker.md`.

### Triage labels

Використовуй п'ять канонічних triage-ролей. Див. `docs/agents/triage-labels.md`.

### Domain docs

Один контекст у кореневому `CONTEXT.md`; незворотні рішення — у `docs/adr/`. Див. `docs/agents/domain.md`.

### Delivery

Для маршрутизації Matt Pocock skills та handoff між агентами див. `docs/agents/workflow.md`.
