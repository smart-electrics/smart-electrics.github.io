---
title: Електромонтаж
slug: electrical-installation
order: 2
kicker: Під час будівництва й оздоблення
description: Переносить погоджену логіку системи в чорновий і чистовий монтаж на об’єкті.
role: Втілює узгоджене розміщення ліній, точок і електротехнічних елементів на об’єкті.
when_to_involve: Під час будівництва та оздоблення, коли виконують чорновий або чистовий монтаж.
scope:
  - Прокладання електричних трас під час чорнового монтажу
  - Підготовка точок до чистового оздоблення
  - Встановлення видимих електротехнічних елементів під час чистового монтажу
  - Підключення виконаних груп до щита
inputs:
  - Узгоджений план електричної системи
  - Стан будівництва або оздоблення
  - Розташування точок на об’єкті
related_services:
  - electrical-design
  - panels-and-protection
  - lighting
  - low-voltage
service_studio:
  direction_id: electrical-installation
  relation_id: panels-and-protection--panel-assembly
  scene_families:
    assembled: electrical-installation
    focus: electrical-installation-finish
    reassembled: panel
  states:
    assembled:
      label: Траси й точки
      title: Траси й точки
      summary: Узгоджені траси й точки задають послідовність чорнового та чистового монтажу.
    focus:
      label: Підключення
      title: Підключення груп
      summary: Підключення поєднує виконані лінії й точки з логікою електромонтажного проєкту.
    reassembled:
      label: Розподіл
      title: Розподіл у щиті
      summary: Схема прокладання груп визначає розподіл у щиті та прив’язку захисту.
---
