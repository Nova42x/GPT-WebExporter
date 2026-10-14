# GPT-WebExporter

[中文](README.md) · English

Export the current ChatGPT conversation to a single HTML file with its original styling, images, fonts, and Intelligent UI interactions. Open the downloaded file in your browser to read offline, adjust sliders, switch charts, and complete quizzes.

![Offline interaction demo: changing the threshold updates metrics, charts, and the confusion matrix](docs/images/interactive-demo.png)

[Download the extension](https://github.com/Nova42x/GPT-WebExporter/releases/latest) · [Implementation design](DESIGN.en.md)

## Features

- **One-click export**: click the browser toolbar button to download `Current conversation title.html` automatically.
- **Original appearance**: preserve text layout, CSS, theme, syntax highlighting, images, fonts, and SVG icons.
- **Offline interactions**: embed the interaction programs and runtime in the HTML, ready to use when opened.
- **Linked charts**: use threshold sliders, metric cards, chart switches, line charts, bar charts, and dynamic confusion matrices.
- **Interactive learning**: explore SQL query flows, table switches, indexes, Buffer Pool, MVCC, lock ranges, and deadlock timelines.
- **Quizzes and explanations**: answer single-choice, multiple-choice, and true/false questions; submit for scoring, view explanations, retry, and use LearningQuiz cards.
- **Reading tools**: copy and wrap code, enlarge attached images, inspect citations, and view follow-up prompts.
- **Current conversation capture**: save loaded messages in the selected branch by their actual message IDs, including loaded content outside the viewport.
- **State restoration**: restore saved quiz state and current slider values or selected options with identifiable state bindings. Each file opens from its export snapshot or component initial state.
- **Export report**: review message counts, interactive response counts, resource results, and notices.

## Install and use

Works with Microsoft Edge and Google Chrome.

1. Download the extension ZIP from the [release page](https://github.com/Nova42x/GPT-WebExporter/releases/latest) and extract it to a permanent folder.
2. Open `edge://extensions` in Edge or `chrome://extensions` in Chrome.
3. Enable **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`.
4. Open the ChatGPT conversation you want to save and wait for the response to finish. For long conversations, scroll to load the content you want to include.
5. Click **GPT-WebExporter** in the toolbar. A new tab displays progress, and the HTML downloads automatically when ready.
6. Open the downloaded file in Edge or Chrome to read and use its interactive components offline.

Keep the source conversation open during export and leave the progress tab open until the download starts. Use the export report to check message counts and resource results. Buttons such as “Continue to the next stage” display their original prompts for copying into the source conversation. Citation links open the corresponding web pages.

To update, replace the files in the installation folder and click **Reload** on the extensions page. Export again to create an HTML file using the new version.

## Local processing

Capture, resource embedding, and HTML generation run locally. The extension reads the selected conversation using the current page data and signed-in session. It temporarily captures JSON responses for that conversation during export, then cleans up the capture bridge.

Styles, fonts, and images are stored in the HTML. Each interactive response runs in its own sandbox with permission for local script execution; CSP isolates component network connections. The resulting file can be stored, backed up, or shared directly and contains the conversation content included in the export.

## Development

Requires Node.js 22 or later.

```sh
npm ci
npm test
npm run build
```

Load the built `dist` directory on the browser extensions page. Rebuild after source changes and click **Reload**. Run `node scripts/serve.mjs` for a local preview at `http://127.0.0.1:47831`.

| Module | Purpose |
| --- | --- |
| `src/collector.js` | Capture current messages, styles, and resources |
| `src/extractor.js` | Decode page transport data and merge by message ID |
| `src/transport-bridge.js` | Temporarily capture current conversation responses |
| `src/components.js`, `src/runtime.js` | Run interactive components |
| `src/chart-components.js` | Render offline charts |
| `src/archive.js` | Embed resources and build the single HTML file |
| `src/export-job.js` | Coordinate capture, build, and download |

Automated cases cover decoding, conversation scope, state merging, resource embedding, SVG, component execution, and capture bridge cleanup. Synthetic cases run independently; local conversation samples provide additional validation.

## License

The project uses the [MIT License](LICENSE). Third-party runtime licenses are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). Exported content and original site styles retain their respective rights.
