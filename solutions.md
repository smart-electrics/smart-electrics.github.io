---
layout: page
title: Готові рішення
description: Готові до адаптації конфігурації електричних систем для типових потреб об’єкта.
permalink: /solutions/
solutions_catalogue: true
---

{% assign ordered_solutions = site.solutions | sort: "order" %}

<section class="solutions-atlas" aria-labelledby="solutions-atlas-title">
  <div class="solutions-atlas__intro">
    <p class="section-kicker">01 / 06 · Атлас конфігурацій</p>
    <h2 id="solutions-atlas-title">Починаємо з потреби об’єкта, а не з переліку технологій.</h2>
    <p>Кожна конфігурація поєднує складові електричної системи, які можна адаптувати до конкретного електромонтажного проєкту.</p>
  </div>

  <nav class="solutions-compass" aria-label="Навігація готовими рішеннями">
    <ol class="solutions-compass__list">
      {% for solution in ordered_solutions %}
        <li>
          <a href="#solution-{{ solution.slug }}">
            <span aria-hidden="true">{{ solution.order | prepend: "0" | slice: -2, 2 }}</span>
            <span>{{ solution.title }}</span>
          </a>
        </li>
      {% endfor %}
    </ol>
  </nav>

  <ol class="solutions-atlas__list">
    {% for solution in ordered_solutions %}
      <li class="solutions-atlas__item" id="solution-{{ solution.slug }}">
        <a class="solution-scene" href="{{ solution.url | relative_url }}" aria-label="{{ solution.title }}, переглянути готове рішення">
          <span class="solution-scene__media">
            <picture>
              <source media="(max-width: 767px)" srcset="{{ solution.image_768 | relative_url }}" width="768" height="512">
              <source srcset="{{ solution.image_1536 | relative_url }}" width="1536" height="1024">
              <img src="{{ solution.image_1536 | relative_url }}" width="1536" height="1024" sizes="(max-width: 767px) calc(100vw - 2 * var(--page-gutter)), 78vw" alt="{{ solution.image_alt }}" loading="lazy" decoding="async"{% if solution.image_focus %} style="object-position: {{ solution.image_focus }}"{% endif %}>
            </picture>
            <span class="solution-scene__media-fallback" aria-hidden="true"></span>
            <span class="solution-scene__labels" aria-hidden="true">
              {% for system in solution.systems limit: 2 %}<span>{{ system }}</span>{% endfor %}
            </span>
          </span>
          <span class="solution-scene__copy">
            <span class="solution-scene__number" aria-hidden="true">{{ solution.order | prepend: "0" | slice: -2, 2 }}</span>
            <span class="solution-scene__eyebrow">{{ solution.kicker }}</span>
            <span class="solution-scene__title">{{ solution.title }}</span>
            <span class="solution-scene__description">{{ solution.description }}</span>
            <span class="solution-scene__action">Переглянути конфігурацію <span aria-hidden="true">↗</span></span>
          </span>
        </a>
      </li>
    {% endfor %}
  </ol>
</section>
