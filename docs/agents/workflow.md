# Delivery workflow

Кореневий агент на `gpt-5.6-sol` з `xhigh` оркеструє роботу, розподіляє незалежні контексти й приймає підсумкове рішення. Одночасно відкрито не більше чотирьох дочірніх агентів. Спільний стан зберігається у версіонованих артефактах (Issue, специфікації, код, PR), а не в переказах між агентами.

| Фаза | Matt skill | Власник і handoff |
| --- | --- | --- |
| Початкова конфігурація | `setup-matt-pocock-skills` | Sol перевіряє tracker, labels і domain docs; результат — ці файли. |
| Черга запитів | `triage` | Terra read-only збирає факти; Sol підтверджує стан із людиною; результат — Issue/brief. |
| Дослідження | `research` | Terra read-only перевіряє першоджерела та зберігає висновок; Sol перевіряє застосовність. |
| Перевірка ідеї | `grilling` | Sol ставить питання frontier-раундами; не починати реалізацію до закриття рішень. |
| Рішення + домен | `grill-with-docs` | Sol викликає `grilling` і `domain-modeling`; результат — оновлений глосарій або ADR за потреби. |
| Прототипування | `prototype` | Terra створює ізольований throwaway-прототип; Sol фіксує висновок в Issue, а не переносить прототип у main. |
| Специфікація | `to-spec` | Sol синтезує підтверджені рішення у GitHub Issue; reviewer звіряє з контекстом. |
| Декомпозиція | `to-tickets` | Sol формує вертикальні slices та блокери; користувач схвалює розмір і залежності. |
| Діагностика | `diagnosing-bugs` | Terra будує red-capable loop, Sol перевіряє докази та гіпотези до виправлення. |
| Тестовий цикл | `tdd` | Terra-реалізатор працює на погодженому seam: red → green по одному вертикальному slice. |
| Реалізація | `implement` | Terra-реалізатор змінює лише призначені файли; Sol контролює scope, Issue і критерії. |
| Review | `code-review` | Два незалежні read-only агенти перевіряють standards і spec; Sol усуває або ескалує findings. |
| Доменна мова | `domain-modeling` | Sol веде один `CONTEXT.md`; ADR створюється лише для важко зворотних trade-off. |
| Агентні документи | `writing-for-agents` | Terra-документатор тримає вказівники короткими; Sol перевіряє відсутність дублювання й застарілих кешів. |

## Ролі

- `frontend_implementer` і `content_designer` (Terra) можуть писати тільки у межах явно призначеної задачі.
- `independent_reviewer` (Terra) та `mechanical_verifier` (Luna) працюють read-only. Reviewer не схвалює власну реалізацію.
- Luna виконує вузькі повторювані перевірки: статус, формат, посилання, команди валідації та повноту чеклістів. Terra виконує суттєву реалізацію, дослідження й незалежний review.

Codex автоматично знаходить ці project-scoped ролі як окремі TOML-файли в
`.codex/agents/`; не реєструй їх повторно вкладеними таблицями в
`.codex/config.toml`.

Перед handoff агент передає номер Issue/PR, acceptance criteria, межі файлів, команду перевірки, отриманий результат і відкриті ризики. Sol перевіряє первинні артефакти, а не лише переказ, перед злиттям результатів.

## Exact `origin/main` bootstrap

Перед створенням гілки або worktree агент виконує `git fetch origin main` і записує SHA командою `git rev-parse origin/main`. Нову гілку й ізольований worktree створюють саме від записаного SHA, наприклад `git worktree add -b <branch> <path> <sha>`.

Для наявної feature-гілки до продовження роботи й ще раз безпосередньо перед PR агент повторює fetch, записує поточний `origin/main` SHA і вливає його в гілку командою `git merge --no-edit <sha>`; коли можливо, це буде fast-forward, інакше — звичайний merge commit. Синхронізацію починають лише з чистого призначеного worktree. Конфлікт або unrelated dirty state зупиняє процес до безпечного ізольованого worktree та ручного рішення щодо конфлікту. `rebase`, `reset` і `force-push` для цього потоку заборонені.

## Acceptance і GitHub workflows

Перед handoff або PR реалізатор запускає локальний literal `node scripts/validate_quality_policy.js && make -f Makefile check`. Перший, незалежний від Make dependency graph, preflight відхиляє змінений або спорожнений `check` target до його виконання. Це fail-closed acceptance: перший failed або flaky тест блокує delivery, а Playwright retries лишаються `0`. Безпосередньо перед Chromium gate Make і browser wrapper повторно перевіряють quality policy, тому попередні тести не можуть підмінити Playwright config або test inventory.

Повний `Quality` не запускається в GitHub Actions: workflow відсутній, а local policy відхиляє його повторне додавання або вбудовування в інший workflow. Єдиний канонічний full gate — локальний literal `node scripts/validate_quality_policy.js && make -f Makefile check` на exact PR head перед push і merge. GitHub Pages запускається напряму на кожен push у `main` та збирає exact pushed SHA. CodeQL лишається автоматичним remote PR check, має ручний запуск і свій розклад; його стан і всі інші налаштовані PR checks Sol перевіряє на exact PR SHA.

## Автономне злиття PR

Власник не перевіряє та не схвалює PR вручну. Sol є відповідальним за merge gate і зливає PR самостійно лише після послідовного виконання всіх умов нижче.

1. PR зберігає ланцюжок Issue → гілка → PR і не містить переписаної історії.
2. Два незалежні read-only агенти виконують окремі review: один за standards, другий за spec. Вони не review-ять власну реалізацію. Sol перевіряє їхні первинні докази; кожен finding виправлено й перевірено або залишено явним blocker, який забороняє злиття.
3. Sol перевіряє первинний результат локального `node scripts/validate_quality_policy.js && make -f Makefile check` на exact PR head і всі налаштовані remote PR checks, зокрема чотири CodeQL jobs. Локальний gate має завершитися без fail/skip/todo або retries, а кожен remote check — зі статусом `SUCCESS`; будь-який `FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED` чи flaky результат блокує злиття.
4. Лише після закриття review, зеленого локального acceptance і всіх required remote checks Sol позначає PR ready та створює merge commit: безпосередньо або через auto-merge, налаштований на merge commit. Auto-merge не активують до проходження цього gate.
5. Після злиття Sol підтверджує, що `main` містить merge commit, а GitHub Pages успішно розгорнуті для цієї ревізії.
