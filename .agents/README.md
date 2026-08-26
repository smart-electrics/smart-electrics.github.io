# Project-local agent skills

Codex discovers the committed skills in `.agents/skills/`. They are deliberately
versioned with the site so every agent works from the same instructions.

## Pinned sources

### Matt Pocock workflow skills

Source revision: `mattpocock/skills@5b15a47f2d7150f545fbcacbfe381787fc0230dc`

`setup-matt-pocock-skills`, `grill-with-docs`, `grilling`, `domain-modeling`,
`writing-for-agents`, `research`, `prototype`, `to-spec`, `to-tickets`,
`implement`, `tdd`, `code-review`, `triage`, `diagnosing-bugs`.

These skills define the default delivery workflow. Read
`docs/agents/workflow.md` for their project-specific routing.

### Context Engineering skills

Source revision:
`muratcankoylan/Agent-Skills-for-Context-Engineering@6dbe1a1d868eab51a3bc9011b0f55e2891513e40`

`advanced-evaluation`, `bdi-mental-states`, `context-compression`,
`context-degradation`, `context-fundamentals`, `context-optimization`,
`evaluation`, `filesystem-context`, `harness-engineering`, `hosted-agents`,
`latent-briefing`, `long-horizon-prompting`, `memory-systems`,
`multi-agent-patterns`, `project-development`, `self-improvement-loops`,
`tool-design`.

Use a context-engineering skill only when its trigger matches the task; its
presence does not override the mandatory Matt workflow.

## Integrity verification

`.agents/skill-checksums.sha256` records the SHA-256 digest of every committed
file under `.agents/skills/`. The canonical local
`node scripts/validate_quality_policy.js && make -f Makefile check` runs
`scripts/verify_agent_skills.rb`, which checks the expected skill set, exact
file coverage, and every recorded digest before the site build. Full Quality
does not run in GitHub Actions.

## Update procedure

1. Open a GitHub Issue and record the proposed upstream commit SHA.
2. Use Codex `skill-installer` to install only the paths listed above into this
   project’s `.agents/skills/` directory. Never install from an unpinned branch
   for a committed update.
3. Review the complete upstream diff, especially `SKILL.md`, scripts, templates,
   executable files, and licenses.
4. Update both revision values in this file and `THIRD_PARTY_NOTICES.md`.
5. Regenerate `.agents/skill-checksums.sha256` from the reviewed files with:
   `LC_ALL=C find .agents/skills -type f -print | LC_ALL=C sort | while IFS= read -r file; do shasum -a 256 "$file"; done > .agents/skill-checksums.sha256`.
6. Run `node scripts/validate_quality_policy.js && make -f Makefile check`.
7. Deliver through an independently reviewed PR. Do not auto-update these
   instructions with Dependabot.

Licensing and attribution are in `THIRD_PARTY_NOTICES.md`.
