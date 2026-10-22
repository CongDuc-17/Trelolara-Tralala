---
name: design-taste-frontend
description: >
  Apply Taste Skill to the Task-Management project's frontend UI: creating,
  changing, polishing, or reviewing screens, components, layout, typography,
  colour, responsive behaviour, and interaction states in FE. Use when the user
  requests taste-skill or a more intentional interface. Backend-only work does
  not require this skill.
license: MIT
metadata:
  upstream-repository: "https://github.com/Leonxlnx/taste-skill"
  upstream-commit: "6010f91a9935f1c167dfc500fb1a475681892e6b"
  upstream-path: "skills/taste-skill"
---

# Taste: Task-Management UI identity

Use `$design-taste-frontend` for this repository's UI work. Taste guides visual and interaction decisions; [Ponytail](../ponytail/SKILL.md) guides the smallest complete implementation. The user's requirements and the project constraints below take precedence over upstream aesthetic defaults and generated direction sheets.

## Preserve the product's design system

- Build within `FE/`: React, TypeScript, Vite, React Router, Zustand and Tailwind 4. Reuse `FE/src/components/ui/`, existing Radix/Base UI primitives, and `cn()` from `FE/src/lib/utils.ts`.
- Use the semantic light/dark tokens, radii and Kanban colours in `FE/src/index.css`. Follow surrounding typography, spacing, icon choices and component patterns. A style draw's `--keep palette,type` does not preserve its proposed shell, sizes or radii; preserve the existing values yourself when they are outside the requested change.
- For a local fix or feature, match the surrounding visual language. A new screen should belong to the same app. Change the overall palette, font, shell or layout when the requested work calls for it. Upstream bans on particular hues, borders or repeated panels do not authorize removing the product's established status colours or Kanban cards.
- Keep routing, permissions, real data, drag/drop, card modals and existing interactions working. Use the existing API and state model. Invented metrics and decorative placeholder charts do not belong in the working app; sample data belongs only in a requested prototype and must be identified as such.
- Treat bundled CSS, JavaScript and chart helpers as optional recipes. Translate useful patterns into the existing components and tokens rather than replacing global CSS or adding dependencies to satisfy a style preference.

## Choose the relevant workflow

**App UI is the default here.** For a full app screen or redesign, read [references/app-screens.md](references/app-screens.md). It has its own rules and critique; landing-page image counts, headline scales, scroll scenes and motion quotas do not apply to app screens.

For a component or a small change, read the relevant sections of that reference and inspect the affected UI and callers. Follow the surrounding direction; skip a new style draw when a direction already exists. A review produces findings unless the user also requests changes.

For a new screen or an intentional redesign without a settled direction:

1. Identify who uses it, the primary task, the question the screen answers, and the real data available. Arrange content around that task, with a clear hierarchy, useful density and aligned figures. Do not remove required content just to fit the first viewport.
2. Use `scripts/draw.mjs --app` to explore suitable styles and choose with a reason. Keep the app's fixed palette and type with `--keep palette,type`; apply the project constraints above to the rest of the sheet. Reuse a chosen direction across related screens.
3. Build the shell and content with existing components. Use colour to explain actions, status and data; avoid ornamental chrome. Include the relevant empty, zero, loading, error, selected, focus and disabled states. Keep keyboard use, focus, contrast and reduced motion intact.
4. Check the actual rendered screen at desktop, tablet and phone widths. Compare before/after when changing existing UI. Use the app-screen critique, fix the largest issues within scope, and repeat for at most three rounds. Report remaining issues and checks that could not run.

For a requested public-facing page, read [references/upstream-skill.md](references/upstream-skill.md) for the original page workflow and follow only its relevant supporting references. That preserved source is a reference, not a second discoverable skill. All upstream paths and `<skill>` placeholders resolve from this skill's root, not from `references/`.

## Tools and validation

The upstream `scripts/`, `library/`, `references/` and `assets/` are bundled locally. Read libraries through the draw tool instead of loading all JSON into context. Use only files present in this snapshot: the upstream bundle includes the shared scroll stage but not a scene catalogue or individual scene demos.

Run tools from the repository root. Keep their history and outputs within the project or an allowed temporary directory. In PowerShell, set a project-local history path before using the draw tool:

```powershell
$env:TASTE_SKILL_HISTORY = Join-Path (Get-Location) '.taste-skill/history.json'
node .agents/skills/design-taste-frontend/scripts/draw.mjs --app --list kinds
```

When drawing, pass a task-specific `--out` directory. For visual checks, the commands are:

```text
node .agents/skills/design-taste-frontend/scripts/lint.mjs --app <affected-source-paths>
node .agents/skills/design-taste-frontend/scripts/inspect.mjs --app <running-page-url> --out <task-output-directory>
```

- The browser inspector requires Node 22+ and an installed Chrome, Edge or Chromium. It launches an isolated profile, so authenticated app routes need an authorized session through an available browser tool or another suitable test setup. A login redirect does not verify the intended screen.
- For Vite, inspect a dev/preview URL; opening raw `FE/index.html` does not compile TSX. Use a separate output folder per task; the inspector replaces its prior screenshots in the selected directory.
- Review screenshots at 1440, 768 and 390 pixels, including relevant light/dark and interaction states. Use available browser tools if the inspector cannot run. Respect execution permissions and report missing checks; do not install a runtime or browser just to satisfy this skill.
- Inspect current `FE/package.json` scripts and use the relevant build/lint checks for implementation changes. Taste's aesthetic lint supplements those checks. A reference's demand to "fix every FAIL" remains subject to the requested scope, project overrides and three-round limit. Preserve legitimate product conventions, explain narrowly scoped inspector allowances, and report remaining or out-of-scope findings. Never claim a check that did not run.
- Run asset search only when the UI needs imagery. Use real project assets where available, inspect selected images, and retain source/licence credits for externally sourced media. Do not invent testimonials, customers or proof.

Finish with what changed, what was verified, and any remaining limitation. Include a style name or seed only if a direction was actually drawn.

## Source

Downloaded from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill/tree/6010f91a9935f1c167dfc500fb1a475681892e6b/skills/taste-skill) on 2026-10-22. The original entrypoint is preserved in [references/upstream-skill.md](references/upstream-skill.md); support scripts, libraries, references and assets retain their upstream contents. This entrypoint scopes their use to Task-Management and its existing design system. Copyright (c) 2026 Leonxlnx; see [LICENSE](LICENSE).
