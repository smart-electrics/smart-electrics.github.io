# Visual evidence

These artifacts were captured from real Chromium rendering on the dates noted
below.

- `logo-concepts.png` — three independent throwaway directions used for the
  selection decision; only Direction A was recreated as production artwork;
  captured on 2026-08-22.
- `home-375.png`, `home-768.png`, `home-1024.png`, `home-1440.png`,
  `home-1980.png` — the luxury control-centre homepage at the complete
  Chromium matrix (`375×812`, `768×1024`, `1024×768`, `1440×1000`,
  `1980×1200`); captured on 2026-08-23.
- `services-375.png`, `services-768.png`, `services-1024.png`,
  `services-1440.png`, `services-1980.png` — the complete services catalogue
  at the same Chromium matrix; captured on 2026-08-23 from source commit
  `10ee964`.
- `service-smart-home-375.png`, `service-smart-home-768.png`,
  `service-smart-home-1024.png`, `service-smart-home-1440.png`,
  `service-smart-home-1980.png` — the representative longest service detail
  at the same Chromium matrix; captured on 2026-08-23 from source commit
  `10ee964`.

Regenerate website screenshots from a clean build with the Jekyll server in
`--no-watch` mode and record the source commit in the related pull request. Do
not treat screenshots as the test oracle; `make check` remains authoritative.
