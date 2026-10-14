# GPT-WebExporter implementation design

[中文](DESIGN.md) · English · [Project home](README.en.md)

GPT-WebExporter uses a Manifest V3 browser extension to capture the current ChatGPT conversation and package its styles, content, resources, and interaction programs into one standalone HTML file.

## Data capture

The collector starts from the active conversation page and reads actual message IDs, message DOM, styles, theme, and component templates. The current conversation ID and message IDs define the export scope shared by text, images, code, and quiz templates.

Page transport scripts and current conversation JSON responses supply compiled interaction code, constants, appData, native widgets, and saved state. The decoder processes multiple enqueue fragments using the shared turbo-stream v2 index table, then merges component records by actual message ID. The temporary transport bridge is cleaned up after export.

## Export flow

1. Validate the current conversation URL and establish a temporary capture bridge for its GET JSON responses.
2. Capture loaded messages, DOM, styles, theme, and component templates from the active page.
3. Decode transport data and widget state; merge by conversation ID and actual message ID.
4. Embed CSS, images, fonts, and SVG symbols while preserving original class names, syntax highlighting, and card structure.
5. Write the runtime, component programs, and data into the HTML; create an independent sandbox for each interactive response.
6. Adjust layout to actual component heights and provide image viewing, source links, and follow-up prompt windows.
7. Generate the export report, save `Current conversation title.html` through the browser download API, and clean up the capture bridge.

## Interaction runtime

The runtime supplies `DIL.render/useState/useConstants/useAppData`, `__dil.jsx`, and the corresponding component interfaces to execute interaction programs from the conversation. LearningQuiz uses captured card DOM and data for local answering, scoring, and explanations.

The chart module uses locally bundled Recharts to link sliders, metric cards, chart switches, and confusion matrices. Slider values and selected options with identifiable named state bindings, together with saved quiz state, are stored in the snapshot. Components use the original styles and captured theme.

The parent page handles text layout, enlarged images, code tools, citations, and follow-up prompts. Static content and interaction programs are saved together, and the export report describes the processing results.

## Packaging and isolation

Extension scripts are bundled locally with esbuild. Components in the exported HTML run inside independent `sandbox="allow-scripts"` iframes, with CSP confining execution to the file. The parent page provides navigation for recorded HTTP(S) source links.

The extension ZIP contains runtime files from `dist`, bilingual READMEs, the demo screenshot, and licenses. The source ZIP includes source code, synthetic tests, and build configuration. Local conversation samples are kept separately for additional testing.
