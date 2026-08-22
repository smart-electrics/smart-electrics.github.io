# Issue tracker: GitHub

Issues, специфікації та робочі запити цього проєкту живуть у GitHub Issues репозиторію. Для операцій використовуй `gh`; репозиторій визначай із `git remote -v`.

## Конвенції

- Створити: `gh issue create --title "..." --body "..."`.
- Прочитати: `gh issue view <number> --comments` разом із labels.
- Перелічити: `gh issue list` із потрібними `--state` та `--label`.
- Коментувати, змінювати labels або закривати: `gh issue comment`, `gh issue edit`, `gh issue close`.
- Коли skill каже «publish to the issue tracker», створи GitHub Issue; коли каже «fetch the relevant ticket», виконай `gh issue view <number> --comments`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Зовнішні PR не є чергою запитів для triage.

## Delivery

Після завершення bootstrap кожна зміна починається з Issue. Гілка посилається на номер Issue, PR описує реалізовані acceptance criteria та посилання на Issue. Не закривай батьківський Issue без явної вказівки або підтвердженого завершення його критеріїв.
