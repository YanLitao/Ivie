/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationFunction, OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { insertOutput } from './textHelper';

interface IDisposable {
	dispose(): void;
}

interface HtmlRenderingHook {
	/**
	 * Invoked after the output item has been rendered but before it has been appended to the document.
	 *
	 * @return A new `HTMLElement` or `undefined` to continue using the provided element.
	 */
	postRender(outputItem: OutputItem, element: HTMLElement, signal: AbortSignal): HTMLElement | undefined | Promise<HTMLElement | undefined>;
}

interface JavaScriptRenderingHook {
	/**
	 * Invoked before the script is evaluated.
	 *
	 * @return A new string of JavaScript or `undefined` to continue using the provided string.
	 */
	preEvaluate(outputItem: OutputItem, element: HTMLElement, script: string, signal: AbortSignal): string | undefined | Promise<string | undefined>;
}

interface RenderOptions {
	readonly lineLimit: number;
	readonly outputScrolling: boolean;
}

function clearContainer(container: HTMLElement) {
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
}

function renderImage(outputInfo: OutputItem, element: HTMLElement): IDisposable {
	const blob = new Blob([outputInfo.data()], { type: outputInfo.mime });
	const src = URL.createObjectURL(blob);
	const disposable = {
		dispose: () => {
			URL.revokeObjectURL(src);
		}
	};

	if (element.firstChild) {
		const display = element.firstChild as HTMLElement;
		if (display.firstChild && display.firstChild.nodeName === 'IMG' && display.firstChild instanceof HTMLImageElement) {
			display.firstChild.src = src;
			return disposable;
		}
	}

	const image = document.createElement('img');
	image.src = src;
	const display = document.createElement('div');
	display.classList.add('display');
	display.appendChild(image);
	element.appendChild(display);

	return disposable;
}

const ttPolicy = window.trustedTypes?.createPolicy('notebookRenderer', {
	createHTML: value => value,
	createScript: value => value,
});

const preservedScriptAttributes: (keyof HTMLScriptElement)[] = [
	'type', 'src', 'nonce', 'noModule', 'async',
];

const domEval = (container: Element) => {
	const arr = Array.from(container.getElementsByTagName('script'));
	for (let n = 0; n < arr.length; n++) {
		const node = arr[n];
		const scriptTag = document.createElement('script');
		const trustedScript = ttPolicy?.createScript(node.innerText) ?? node.innerText;
		scriptTag.text = trustedScript as string;
		for (const key of preservedScriptAttributes) {
			const val = node[key] || node.getAttribute && node.getAttribute(key);
			if (val) {
				scriptTag.setAttribute(key, val as any);
			}
		}

		// TODO@connor4312: should script with src not be removed?
		container.appendChild(scriptTag).parentNode!.removeChild(scriptTag);
	}
};

async function renderHTML(outputInfo: OutputItem, container: HTMLElement, signal: AbortSignal, hooks: Iterable<HtmlRenderingHook>): Promise<void> {
	clearContainer(container);
	let element: HTMLElement = document.createElement('div');
	const htmlContent = outputInfo.text();
	const trustedHtml = ttPolicy?.createHTML(htmlContent) ?? htmlContent;
	element.innerHTML = trustedHtml as string;

	for (const hook of hooks) {
		element = (await hook.postRender(outputInfo, element, signal)) ?? element;
		if (signal.aborted) {
			return;
		}
	}

	container.appendChild(element);
	domEval(element);
}

async function renderJavascript(outputInfo: OutputItem, container: HTMLElement, signal: AbortSignal, hooks: Iterable<JavaScriptRenderingHook>): Promise<void> {
	let scriptText = outputInfo.text();

	for (const hook of hooks) {
		scriptText = (await hook.preEvaluate(outputInfo, container, scriptText, signal)) ?? scriptText;
		if (signal.aborted) {
			return;
		}
	}

	const script = document.createElement('script');
	script.type = 'module';
	script.textContent = scriptText;

	const element = document.createElement('div');
	const trustedHtml = ttPolicy?.createHTML(script.outerHTML) ?? script.outerHTML;
	element.innerHTML = trustedHtml as string;
	container.appendChild(element);
	domEval(element);
}

function renderError(outputInfo: OutputItem, container: HTMLElement, ctx: RendererContext<void> & { readonly settings: RenderOptions }): void {
	const element = document.createElement('div');
	container.appendChild(element);
	type ErrorLike = Partial<Error>;

	let err: ErrorLike;
	try {
		err = <ErrorLike>JSON.parse(outputInfo.text());
	} catch (e) {
		console.log(e);
		return;
	}

	if (err.stack) {
		const stack = document.createElement('pre');
		stack.classList.add('traceback');
		stack.style.margin = '8px 0';
		const element = document.createElement('span');
		insertOutput(outputInfo.id, [err.stack ?? ''], ctx.settings.lineLimit, false, element, true);
		stack.appendChild(element);
		container.appendChild(stack);
	} else {
		const header = document.createElement('div');
		const headerMessage = err.name && err.message ? `${err.name}: ${err.message}` : err.name || err.message;
		if (headerMessage) {
			header.innerText = headerMessage;
			container.appendChild(header);
		}
	}

	container.classList.add('error');
}

function renderStream(outputInfo: OutputItem, container: HTMLElement, error: boolean, ctx: RendererContext<void> & { readonly settings: RenderOptions }): void {
	const outputContainer = container.parentElement;
	if (!outputContainer) {
		// should never happen
		return;
	}

	const prev = outputContainer.previousSibling;
	if (prev) {
		// OutputItem in the same cell
		// check if the previous item is a stream
		const outputElement = (prev.firstChild as HTMLElement | null);
		if (outputElement && outputElement.getAttribute('output-mime-type') === outputInfo.mime) {
			// same stream

			// find child with same id
			const existing = outputElement.querySelector(`[output-item-id="${outputInfo.id}"]`) as HTMLElement | null;
			if (existing) {
				clearContainer(existing);
			}

			const text = outputInfo.text();
			const element = existing ?? document.createElement('span');
			element.classList.add('output-stream');
			element.setAttribute('output-item-id', outputInfo.id);
			insertOutput(outputInfo.id, [text], ctx.settings.lineLimit, ctx.settings.outputScrolling, element, false);
			outputElement.appendChild(element);
			return;
		}
	}

	const element = document.createElement('span');
	element.classList.add('output-stream');
	element.setAttribute('output-item-id', outputInfo.id);

	const text = outputInfo.text();
	insertOutput(outputInfo.id, [text], ctx.settings.lineLimit, ctx.settings.outputScrolling, element, false);
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
	container.appendChild(element);
	container.setAttribute('output-mime-type', outputInfo.mime);
	if (error) {
		container.classList.add('error');
	}
}

function renderText(outputInfo: OutputItem, container: HTMLElement, ctx: RendererContext<void> & { readonly settings: RenderOptions }): void {
	clearContainer(container);
	const contentNode = document.createElement('div');
	contentNode.classList.add('output-plaintext');
	const text = outputInfo.text();
	insertOutput(outputInfo.id, [text], ctx.settings.lineLimit, ctx.settings.outputScrolling, contentNode, false);
	container.appendChild(contentNode);
}

export const activate: ActivationFunction<void> = (ctx) => {
	const disposables = new Map<string, IDisposable>();
	const htmlHooks = new Set<HtmlRenderingHook>();
	const jsHooks = new Set<JavaScriptRenderingHook>();

	const latestContext = ctx as (RendererContext<void> & { readonly settings: RenderOptions });

	const style = document.createElement('style');
	style.textContent = `
	.output-plaintext,
	.output-stream,
	.traceback {
		display: inline-block;
		width: 100%;
		line-height: var(--notebook-cell-output-line-height);
		font-family: var(--notebook-cell-output-font-family);
		font-size: var(--notebook-cell-output-font-size);
		user-select: text;
		-webkit-user-select: text;
		-ms-user-select: text;
		cursor: auto;
	}
	.output-plaintext,
	.output-stream {
		white-space: pre-wrap;
	}
	output-plaintext,
	.traceback {
		word-wrap: break-word;
	}
	.output > .scrollable {
		overflow-y: scroll;
		max-height: var(--notebook-cell-output-max-height);
		border: var(--vscode-editorWidget-border);
		border-style: solid;
		padding-left: 4px;
		box-sizing: border-box;
		border-width: 1px;
	}
	.output-plaintext .code-bold,
	.output-stream .code-bold,
	.traceback .code-bold {
		font-weight: bold;
	}
	.output-plaintext .code-italic,
	.output-stream .code-italic,
	.traceback .code-italic {
		font-style: italic;
	}
	.output-plaintext .code-strike-through,
	.output-stream .code-strike-through,
	.traceback .code-strike-through {
		text-decoration: line-through;
	}
	.output-plaintext .code-underline,
	.output-stream .code-underline,
	.traceback .code-underline {
		text-decoration: underline;
	}
	`;
	document.body.appendChild(style);

	return {
		renderOutputItem: async (outputInfo, element, signal?: AbortSignal) => {
			switch (outputInfo.mime) {
				case 'text/html':
				case 'image/svg+xml': {
					if (!ctx.workspace.isTrusted) {
						return;
					}

					await renderHTML(outputInfo, element, signal!, htmlHooks);
					break;
				}
				case 'application/javascript': {
					if (!ctx.workspace.isTrusted) {
						return;
					}

					renderJavascript(outputInfo, element, signal!, jsHooks);
					break;
				}
				case 'image/gif':
				case 'image/png':
				case 'image/jpeg':
				case 'image/git':
					{
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderImage(outputInfo, element);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				case 'application/vnd.code.notebook.error':
					{
						renderError(outputInfo, element, latestContext);
					}
					break;
				case 'application/vnd.code.notebook.stdout':
				case 'application/x.notebook.stdout':
				case 'application/x.notebook.stream':
					{
						renderStream(outputInfo, element, false, latestContext);
					}
					break;
				case 'application/vnd.code.notebook.stderr':
				case 'application/x.notebook.stderr':
					{
						renderStream(outputInfo, element, true, latestContext);
					}
					break;
				case 'text/plain':
					{
						renderText(outputInfo, element, latestContext);
					}
					break;
				default:
					break;
			}
		},
		disposeOutputItem: (id: string | undefined) => {
			if (id) {
				disposables.get(id)?.dispose();
			} else {
				disposables.forEach(d => d.dispose());
			}
		},
		experimental_registerHtmlRenderingHook: (hook: HtmlRenderingHook): IDisposable => {
			htmlHooks.add(hook);
			return {
				dispose: () => {
					htmlHooks.delete(hook);
				}
			};
		},
		experimental_registerJavaScriptRenderingHook: (hook: JavaScriptRenderingHook): IDisposable => {
			jsHooks.add(hook);
			return {
				dispose: () => {
					jsHooks.delete(hook);
				}
			};
		}
	};
};
