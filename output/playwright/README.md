# Visual evidence

These artifacts were captured from real Chromium rendering on the dates noted
below.

- `logo-concepts.png` — three independent throwaway directions used for the
  selection decision; only Direction A was recreated as production artwork;
  captured on 2026-08-22.
- `logo-identity-sizes.png` — owner-facing proof of the refined canonical mark
  and the dedicated micro favicon at 16, 24, 32 and 48 CSS px on dark and light
  environments; captured in real Chromium on 2026-08-23.
- `logo-identity-header-375.png`, `logo-identity-header-1440.png`,
  `logo-identity-header-1980.png` — cropped header renders from the complete
  responsive width matrix, confirming lockup scale, spacing and navigation
  fit after the identity refinement; captured in real Chromium on 2026-08-23.
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
  from source commit `2025ba2` after the active scene image was decoded and
  the initial assemble motion had settled.
- `smart-home-backup-1440.png` — a second causal state of the same simulator,
  showing that selecting the reserve-power scenario changes the route, active
  system, central composition, explanation, and configuration together;
  captured on 2026-08-23 from source commit `2025ba2` after the outgoing
  disassemble layer had completed.

Regenerate website screenshots from a clean build with the Jekyll server in
`--no-watch` mode and record the source commit in the related pull request. Do
not treat screenshots as the test oracle; the authoritative local gate is
`node scripts/validate_quality_policy.js && make -f Makefile check`.
