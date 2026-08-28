---
title: Щити та захист
slug: panels-and-protection
order: 3
kicker: На етапі груп і підключення
description: Організовує розподіл, комутацію та захист електричних груп у системі об’єкта.
role: Організовує електричні групи для розподілу, комутації та захисту.
when_to_involve: Під час проєктування, монтажу та підключення електричних груп.
scope:
  - Визначення структури електричних груп
  - Організація розподілу живлення
  - Підготовка рішень для комутації груп
  - Узгодження захисту в межах електричної системи
inputs:
  - План груп і навантажень
  - Дані про електричні точки
  - Відомості про заплановані суміжні системи
related_services:
  - electrical-design
  - electrical-installation
  - backup-power
  - smart-home-integration
service_studio:
  direction_id: panels-and-protection
  relation_id: panels-and-protection--panel-assembly
  scene_families:
    assembled: panel-intake
    focus: panel
    reassembled: panel-priorities
  states:
    assembled:
      label: Ввід
      title: Ввід живлення
      summary: Ввід живлення розглядають разом із визначеними групами та межами об’єкта.
    focus:
      label: Захист
      title: Захист груп
      summary: Захист і комутацію узгоджують для визначеної структури електричних груп.
    reassembled:
      label: Розподіл і пріоритети
      title: Розподіл і пріоритети
      summary: Розподіл і пріоритети пов’язують із суміжними роботами в межах електромонтажного проєкту.
---
