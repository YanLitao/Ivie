import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { OpenaiFetchAPI } from 'vs/workbench/services/editor/browser/codexExplainer';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { observableFromEvent } from 'vs/base/common/observable';

export function addExplainer() {
	console.log("added explainer");
}

const staticsLength = (arr: number[]): { median: number; mean: number; min: number; max: number } | undefined => {
	if (!arr.length) return undefined;
	const s = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	const median = s.length % 2 === 0 ? ((s[mid - 1] + s[mid]) / 2) : s[mid];
	const mean = s.reduce((a, b) => a + b) / s.length;
	const min = s[0];
	const max = s[s.length - 1];
	return { median, mean, min, max };
};

function getStartPos(lengthArray: number[]) {
	var lines = staticsLength(lengthArray);
	if (lines === undefined) {
		return 400;
	}
	var median = lines.median,
		max = lines.max;
	if (max >= 60 && median >= 60) {
		return 360;
	} else if (max >= 60 && median < 60) {
		return median * 10;
	} else {
		return max * 7;
	}
}

function diffText(textA: string, textB: string) {
	var diff = "",
		startLine = 0,
		startFlag = false,
		lineLength = [];
	var text1 = textA.split("\n"),
		text2 = textB.split("\n"),
		startIdx = 0;
	for (var i = 0; i < text1.length; i++) {
		var flag = false;
		for (var j = startIdx; j < text2.length; j++) {
			if (text1[i] === text2[j]) {
				flag = true;
				startIdx = j + 1;
				break;
			}
		}
		if (flag === false) {
			diff += text1[i] + "\n";
			lineLength.push(text1[i].length);
			if (startFlag === false) {
				startLine = i + 1;
				startFlag = true;
			}
		}
	}
	return { diff, startLine, lineLength };
}

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	constructor(
		private readonly _editor: ICodeEditor,
		private _box: HTMLDivElement,
		private _posttext: string,
		private _pretext: string,
		private _ghostTextController: GhostTextController | null
	) {
		this._editor.onKeyDown((e) => { this.onKeyDown(e); });
		this._editor.onKeyUp((e) => { this.onKeyUp(e); });
		this._editor.onDidDispose(() => { this.dispose(); });
		this._ghostTextController = GhostTextController.get(this._editor);
		if (this._ghostTextController == null) {
			return;
		} else {
			//console.log(this._ghostTextController);
			//console.log(this._ghostTextController.editor);
			if (this._ghostTextController !== undefined) {
				const activeModel = this._ghostTextController.activeModel;
				if (activeModel !== undefined) {
					activeModel.onDidChange(function () { console.log("Try again 3", activeModel.inlineCompletionsModel.ghostText?.parts[0].lines) })
				}
			}
			// this._ghostTextController.onActiveModelDidChange(() => { this.ghostTextChange(); });
			this._ghostTextController.onActiveModelDidChange(console.log);
		}
	}

	private onKeyDown(e: IKeyboardEvent) {
		this._pretext = this._editor.getValue();
	}

	private onKeyUp(e: IKeyboardEvent) {
		this._posttext = this._editor.getValue();
		var diffed = diffText(this._posttext, this._pretext);
		if (diffed["diff"].split("\n").length > 3) {
			const editor_div = this._editor.getDomNode();
			if (editor_div === null) {
				throw new Error('Cannot find Monaco Editor');
			}
			if (document.getElementById("explainer_container") !== null) {
				return;
			}
			var last_explain = document.getElementById("explainer_container");
			if (last_explain !== null) {
				last_explain.remove();
			}
			var parent = editor_div.getElementsByClassName("lines-content monaco-editor-background");
			var trueVisableEditor = parent[0].parentElement;
			var explainStart = getStartPos(diffed.lineLength);
			var editorWidth = Number(trueVisableEditor?.style.width.replace("px", ""));
			var explainWidth = editorWidth - explainStart;

			var lineHeight = 18,
				totalLine = this._posttext.split("\n").length,
				generateLine = diffed["diff"].split("\n").length - 1;

			this._box = document.createElement('div');
			this._box.style.position = 'absolute';
			this._box.style.top = (diffed["startLine"] - 2) * lineHeight + 22 + 'px'; // offset from the run button + border + padding
			this._box.style.bottom = '14px'; // offset from the horizontal scroll bar (if any)
			this._box.style.left = explainStart + 'px';
			this._box.style.height = generateLine * lineHeight + 'px';
			//this._box.style.width = explainWidth + 'px';
			//this._box.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
			this._box.id = "explainer_container";
			this._box.style.zIndex = '100';
			var border_div = document.createElement('div');
			border_div.style.float = 'left';
			border_div.style.width = '30px';
			border_div.style.height = generateLine * lineHeight + 'px';
			border_div.style.backgroundImage = 'linear-gradient(to right, rgba(60, 60, 60, 0), rgba(60, 60, 60, 1) 100%)';
			this._box.appendChild(border_div);
			var content_div = document.createElement('div');
			content_div.style.width = explainWidth - 30 + 'px';
			content_div.style.height = generateLine * lineHeight + 'px';
			content_div.style.float = 'right';
			content_div.style.backgroundColor = 'rgba(60, 60, 60, 1)';
			content_div.style.boxSizing = 'border-box';
			content_div.style.display = 'block';
			this._box.appendChild(content_div);
			border_div.addEventListener('click', function (this) {
				if (this.parentElement) {
					if (content_div.style.display == 'none') {
						content_div.style.display = 'block';
						this.parentElement.style.left = explainStart + 'px';
					} else {
						this.parentElement.style.left = editorWidth - 30 + 'px';
						content_div.style.display = 'none';
					}
				}
			});
			//editor_div.appendChild(this._box);
			//Find logDiv
			/* var partEditor = editor_div.closest(".part.editor");
			var splitViewContainer = partEditor?.parentElement?.parentElement;
			var splitView = splitViewContainer?.getElementsByClassName("split-view-view visible");
			var trueSplitView = splitView?.item(3);
			var logDiv = trueSplitView?.querySelector(".view-lines.monaco-mouse-cursor-text");
			console.log(logDiv); */


			async function getExplain(div: HTMLDivElement, text: string, lineHeight: number, startLine: number, totalLine: number) {
				await OpenaiFetchAPI(text, 3, lineHeight, div);
			}
			//const config = vscode.workspace.getConfiguration();
			//console.log("lineHeight",config.get("lineHeight"));
			getExplain(content_div, diffed["diff"], lineHeight, diffed["startLine"], totalLine);
			parent[0].insertBefore(this._box, parent[0].firstChild);
		}
	}


	public dispose(): void {
		console.log("disposed");
		if (document.getElementById("explainer_container") !== null) {
			return;
		} else {
			this._box.remove();
		}
	}
}
registerEditorContribution(Explainer.ID, Explainer, EditorContributionInstantiation.BeforeFirstInteraction);
