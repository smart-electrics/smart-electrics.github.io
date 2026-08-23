---
title: Послуги
description: "Повний цикл електричних робіт: від інженерної схеми й чорнового монтажу до автоматизації, діагностики та сервісу."
permalink: /services/
kicker: Вісім напрямів
services_catalogue: true
---

<section class="service-catalogue" aria-labelledby="services-catalogue-title">
  <div class="service-catalogue__intro">
    <p class="section-kicker">01 / 08 · Напрями системи</p>
    <h2 id="services-catalogue-title">Усі складові електричної системи в одному проєкті.</h2>
    <p>Оберіть напрям, щоб дізнатися про його роль, етап і суміжні системи.</p>
  </div>

  {% assign ordered_services = site.services | sort: "order" %}
  <ol class="service-catalogue__list">
    {% for service in ordered_services %}
      <li class="service-catalogue__item">
        <a class="service-catalogue__link" href="{{ service.url | relative_url }}" aria-label="{{ service.title }}, переглянути напрям">
          <span class="service-catalogue__number" aria-hidden="true">{{ service.order | prepend: "0" | slice: -2, 2 }}</span>
          <span class="service-catalogue__content">
            <span class="service-catalogue__stage">{{ service.when_to_involve }}</span>
            <span class="service-catalogue__title">{{ service.title }}</span>
            <span class="service-catalogue__role">{{ service.role }}</span>
          </span>
          <span class="service-catalogue__trajectory" aria-hidden="true">Перейти <span>↗</span></span>
        </a>
      </li>
    {% endfor %}
  </ol>
</section>
