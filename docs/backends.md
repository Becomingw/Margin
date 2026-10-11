# External-agent handoff

Margin has no built-in AI backend. No model, provider or API key is required.
The setup command ignores historical provider flags; doctor never calls a model.
AI HTTP routes return 410 even when an imported configuration enables an agent.

To work with an external agent, export a review package and provide its `REVIEW.md`
and current sources. The package includes structured comment and revision history.
See [review-package.md](review-package.md). Import restores complete snapshots;
editing only the Markdown summary is not an applicable patch protocol.

Compatibility adapter code and configuration guards remain in the source tree,
but are not a supported execution path from the review workspace.
