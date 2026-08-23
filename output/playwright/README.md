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
- `solutions-375.png`, `solutions-768.png`, `solutions-1024.png`,
  `solutions-1440.png`, `solutions-1980.png` — the complete ready-solutions
  atlas at the same Chromium matrix; captured on 2026-08-23 from source commit
  `8edf73e263f5bac559483655aeecd1b61291ee30` after every lazy image was decoded
  and painted.
- `solution-private-house-375.png`, `solution-private-house-768.png`,
  `solution-private-house-1024.png`, `solution-private-house-1440.png`,
  `solution-private-house-1980.png` — the representative longest solution
  detail at the same Chromium matrix; captured on 2026-08-23 from source commit
  `8edf73e263f5bac559483655aeecd1b61291ee30` after its responsive hero was
  decoded and painted.
- `smart-home-375.png`, `smart-home-768.png`, `smart-home-1024.png`,
  `smart-home-1440.png`, `smart-home-1980.png` — the cinematic smart-home
  simulator at the full `375–1980` Chromium matrix; captured on 2026-08-23
  from source commit `22b721c` after the active scene image was decoded and
  the initial assemble motion had settled.
- `smart-home-backup-1440.png` — a second causal state of the same simulator,
  showing that selecting the reserve-power scenario changes the route, active
  system, central composition, explanation, and configuration together;
  captured on 2026-08-23 from source commit `22b721c`.

Regenerate website screenshots from a clean build with the Jekyll server in
`--no-watch` mode and record the source commit in the related pull request. Do
not treat screenshots as the test oracle; `make check` remains authoritative.
