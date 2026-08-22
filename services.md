---
title: Послуги
description: Повний цикл електричних робіт — від інженерної схеми й чорнового монтажу до автоматизації, діагностики та сервісу.
permalink: /services/
kicker: Повний цикл
---

<p class="page-note">Детальні описи, межі робіт і матеріали для прорахунку будуть опубліковані перед повним запуском сайту.</p>

<div class="service-grid">
  {% assign ordered_services = site.services | sort: "order" %}
  {% for service in ordered_services %}
    <a class="service-card" href="{{ service.url | relative_url }}">
      <span class="service-card__number">{{ service.order | prepend: "0" | slice: -2, 2 }}</span>
      <span class="service-card__title">{{ service.title }}</span>
      <span class="service-card__arrow" aria-hidden="true">↗</span>
    </a>
  {% endfor %}
</div>
