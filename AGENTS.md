# AGENTS.md — BPMN repository contract

This repository is the source of truth for BPMN 2.0 diagrams used by the online editor.

## Repository

- Repository: `sergeygalay/bpmn-editor`
- Default branch: `main`
- Online editor: `https://sergeygalay.github.io/bpmn-editor/`
- Direct diagram URL: `https://sergeygalay.github.io/bpmn-editor/?diagram=<id>`

## Source of truth

- BPMN models: `diagrams/*.bpmn`
- Diagram catalog: `diagrams/index.json`
- Web editor: `index.html`, `app.js`, `styles.css`

Always read `diagrams/index.json` before creating, locating, renaming, or deleting a diagram.

## Expected AI workflow

When a user asks to create, inspect, explain, or modify a BPMN diagram in this repository, work directly with the repository instead of proposing manual download/import workflows.

### Create a diagram

1. Read `diagrams/index.json`.
2. Choose a stable, URL-safe lowercase `id` using kebab-case when needed.
3. Create `diagrams/<id>.bpmn` as valid BPMN 2.0 XML.
4. Include BPMN DI (`BPMNDiagram`, `BPMNPlane`, shapes, edges and waypoints) so the diagram renders immediately in bpmn-js.
5. Add the diagram to `diagrams/index.json` with at least:
   - `id`
   - `name`
   - `path`
   - `group` when useful
   - `description` when useful
6. Preserve valid JSON and existing catalog entries.
7. Return the direct editor URL `https://sergeygalay.github.io/bpmn-editor/?diagram=<id>`.

### Inspect a diagram

1. Resolve the diagram through `diagrams/index.json` when the user provides a name or id.
2. Read the current `.bpmn` file from GitHub before describing it.
3. Explain the semantic BPMN flow, actors, events, gateways, exceptions and message interactions based on the XML, not merely on assumptions from a previous chat.

### Modify a diagram

1. Read `diagrams/index.json` and the current `.bpmn` file first.
2. Preserve existing element IDs when the same semantic element remains in the process.
3. Change BPMN semantics first, then update BPMN DI to keep the layout readable.
4. Preserve unrelated content and metadata.
5. Write the complete updated BPMN XML back to the same file.
6. Do not create a duplicate diagram unless the user asks for a copy/version.
7. Return the same direct editor URL after the update.

### Rename a diagram

If only the human-readable name changes, prefer updating the catalog `name` and BPMN process/collaboration names without changing the stable `id` or file path unless the user explicitly requests a rename of the identifier.

### Delete a diagram

1. Confirm the intended diagram from the catalog.
2. Delete its `.bpmn` file.
3. Remove its entry from `diagrams/index.json`.
4. Do not delete unrelated diagrams.

## BPMN modeling rules

Prefer semantically correct BPMN 2.0 over visually convenient but incorrect notation.

Use BPMN elements according to meaning:

- start, intermediate and end events;
- user, manual, service, send, receive, business-rule and other task types when appropriate;
- exclusive, parallel, inclusive and event-based gateways;
- subprocesses and call activities when process decomposition helps;
- boundary events for attached exceptions/timeouts/errors when appropriate;
- pools for independent participants;
- lanes for roles or responsibilities within the same participant/process;
- sequence flows only inside one process/pool;
- message flows only between participants/pools;
- data objects, stores, annotations and associations when they materially improve the model.

Do not connect separate pools with sequence flow. Do not use message flow between lanes of the same pool.

When the user's description is ambiguous, choose the simplest valid BPMN model that preserves the intended business meaning. Ask a clarifying question only when the ambiguity materially changes the process semantics.

## Layout rules

Every diagram intended for the online editor must contain usable BPMN DI.

Aim for:

- left-to-right primary flow;
- minimal line crossings;
- aligned tasks/events;
- enough spacing for readable labels;
- orthogonal waypoints for long cross-lane flows where useful;
- readable pools/lanes and participant labels;
- no overlapping shapes or labels when avoidable.

When adding elements to an existing diagram, keep the existing visual structure unless a relayout is necessary.

## Catalog format

Expected structure:

```json
{
  "diagrams": [
    {
      "id": "shop",
      "name": "Покупка в магазине",
      "path": "diagrams/shop.bpmn",
      "group": "Продажи",
      "description": "Процесс покупки товара в магазине"
    }
  ]
}
```

Additional metadata may be added later, but existing fields must not be silently removed.

## Online editor behavior

The GitHub Pages application loads models from `diagrams/index.json` and `diagrams/*.bpmn`.

The editor may also allow a user to save BPMN XML directly back to GitHub. Changes made by the user in the browser therefore may be newer than the AI's prior conversational context. Always read the current repository version before editing.

## Safety around GitHub credentials

Never ask the user to paste a GitHub personal access token into ChatGPT. Tokens used by the browser editor should remain in the browser/session and must never be committed to this repository.

Do not add secrets, tokens, OAuth client secrets or credentials to source files.

## Preferred user experience

For normal BPMN requests, do not default to:

- downloading `.bpmn` files;
- importing files manually into another editor;
- converting BPMN to Mermaid as a substitute;
- drawing a generic flowchart instead of BPMN 2.0.

Use this repository and online editor as the normal working surface unless the user explicitly asks for another format or tool.

## Response convention

After a successful create or update, give the user the direct online link:

`https://sergeygalay.github.io/bpmn-editor/?diagram=<id>`

Keep repository implementation details brief unless the user asks for them.
