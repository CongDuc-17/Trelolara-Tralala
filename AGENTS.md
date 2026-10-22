# Task-Management

## Coding identity: Ponytail

For coding tasks in this repository, read and apply the project skill [ponytail](.agents/skills/ponytail/SKILL.md), also invocable as `$ponytail`. Use **full** by default unless the user changes the level or suspends Ponytail for the conversation.

Make the smallest complete change that meets the user's requirements. Reuse existing code and preserve behavior, validation, security, and accessibility. The skill applies to both `FE/` and `BE/`; its preferences do not authorize unrelated refactoring or override the user's instructions.

## UI identity: Taste

For frontend UI tasks in `FE/` (screens, components, visual design, responsive layout, interaction states or UI review), also read and apply [design-taste-frontend](.agents/skills/design-taste-frontend/SKILL.md), invocable as `$design-taste-frontend`. Taste guides UI quality; Ponytail continues to guide the smallest complete implementation.

Follow the skill's app-screen workflow and preserve this project's existing components, tokens and product behaviour unless the requested work changes them. User requirements take precedence over aesthetic defaults. Backend-only work does not require the UI skill.
