# Docs

Everything written down about Folk Valley that is not source code.

| Where | What is in it | Read it when |
|---|---|---|
| [`PLAN.md`](PLAN.md) | **The plan of record.** Architecture, milestones with their definitions of done, and decision records | Before doing any work here |
| [`STATUS.md`](STATUS.md) | Where the build stands: what has landed and what is still to do | Picking up work, or before saying what exists |
| [`findings.md`](findings.md) | What has been measured or learned, negative results included | The day you measure or learn something |
| [`RELEASING.md`](RELEASING.md) | When a version is cut, which number it gets, and the steps to publish it | Cutting a release |
| [`../tools/ci/README.md`](../tools/ci/README.md) | The checks CI runs, how to configure or add one, and the asset provenance manifest | A check fails, a rule should become one, or you add an asset |

Rules for working in this repo are in [`../AGENTS.md`](../AGENTS.md), which every AI agent
reads and which is the shortest description of how the project works. Humans have
[`../CONTRIBUTING.md`](../CONTRIBUTING.md), and every reviewer has
[`../REVIEWING.md`](../REVIEWING.md).

Two habits keep these pages worth reading:

- **A measurement or lesson goes in [`findings.md`](findings.md) the day it is taken**,
  negative results included, with its conditions.
- **A decision that costs more than an hour to reverse gets a decision record** in
  [`PLAN.md`](PLAN.md), so nobody relitigates it from memory.
