import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { OpenaiFetchAPI, drawBends } from 'vs/workbench/services/editor/browser/codexExplainer';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { IScrollEvent } from 'vs/editor/common/editorCommon';

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

function getStartPos(textArray: string[]) {
	var lengthArray = [];
	for (var i = 0; i < textArray.length; i++) {
		lengthArray.push(textArray[i].length);
	}
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
		startFlag = false;
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
			if (startFlag === false) {
				startLine = i + 1;
				startFlag = true;
			}
		}
	}
	return { diff, startLine };
}

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	constructor(
		private readonly _editor: ICodeEditor,
		private box: HTMLDivElement,
		private _boxRange: undefined | [number, number],
		private _posttext: string,
		private _pretext: string,
		private _ghostTextController: GhostTextController | null,
		private _summaryArr: Promise<void | [number, number, string][]>,
		private _expandFlag: boolean,
	) {
		this._expandFlag = true;
		this._editor.onDidScrollChange((e) => { this.onDidScrollChange(e); });
		this._editor.onKeyDown((e) => { this.onKeyDown(); });
		this._editor.onKeyUp((e) => { this.onKeyUp(); });
		this._editor.onDidDispose(() => { this.dispose(); });
		this._editor.onMouseDown(() => { this.onMouseDown(); });
		this._editor.onDidLayoutChange(() => { this.onLayoutChange(); });
		this._editor.onDidContentSizeChange(() => { this.onContentSizeChange(); });
		this._ghostTextController = GhostTextController.get(this._editor);
		if (this._ghostTextController == null) {
			return;
		} else {
			//console.log(this._ghostTextController);
			//console.log(this._ghostTextController.editor);
			if (this._ghostTextController !== undefined) {
				const activeModel = this._ghostTextController.activeModel;
				if (activeModel !== undefined) {
					activeModel.onDidChange(() => { this.ghostTextChange() });
				}
			}
			// this._ghostTextController.onActiveModelDidChange(() => { this.ghostTextChange(); });
			this._ghostTextController.onActiveModelDidChange(console.log);
		}
	}

	private disposeExplanations() {
		var last_explain = document.getElementsByClassName("explainer-container");
		for (var i = 0; i < last_explain.length; i++) {
			last_explain[i].remove();
			this._boxRange = undefined;
		}
	}

	private onMouseDown() {
		var mousePos = this._editor.getPosition();
		if (mousePos !== null && this._boxRange !== undefined) {
			if (mousePos.lineNumber < this._boxRange[0] || mousePos.lineNumber > this._boxRange[1]) {
				this.disposeExplanations();
			}
		}
	}

	private onDidScrollChange(e: IScrollEvent) {
		console.log(this.box);
		if (this.box) {
			console.log(this.box.style.top);
			this.box.style.top = -this._editor.getScrollTop() + "px";
		}
	}

	private onLayoutChange() {
		//console.log(this._editor.getLayoutInfo(), this._editor.getContentWidth());
	}

	private onContentSizeChange() {
		//console.log(this._editor.getContentWidth());
	}

	private ghostTextChange() {
		const activeModel = this._ghostTextController?.activeModel;
		var generatedCode = activeModel?.inlineCompletionsModel.ghostText?.parts[0].lines.join("\n");
		if (generatedCode === undefined) {
			return;
		}
		async function getExplain(text: string) {
			var summaryArr = await OpenaiFetchAPI(text, 3);
			return summaryArr;
		}
		this._summaryArr = getExplain(generatedCode);
		var mousePos = this._editor.getPosition();
		if (mousePos !== null) {
			var generatedCodeLength = generatedCode.split("\n").length;
			//var startLine = mousePos.lineNumber - generatedCodeLength;
			this.createExplainer(generatedCode, mousePos.lineNumber, generatedCodeLength);
		}
	}

	private onKeyUp() {
		this._posttext = this._editor.getValue();
		var diffed = diffText(this._posttext, this._pretext);
		var eachLine = diffed["diff"].split("\n");
		if (eachLine.length > 3) {
			//this.createExplainer(diffed['diff'], diffed['startLine'], eachLine.length);
		} else {
			console.log("one line");
			this.disposeExplanations();
		}
	}

	private onKeyDown() {
		this._pretext = this._editor.getValue();
		var mousePos = this._editor.getPosition();
		if (mousePos !== null && this._boxRange !== undefined) {
			if (mousePos.lineNumber < this._boxRange[0] || mousePos.lineNumber > this._boxRange[1]) {
				this.disposeExplanations();
			}
		}
	}

	private expandEditor(parent: Element) {
		if (parent === null) {
			console.log('Cannot find editor');
			return;
		}
		console.log(parent);
		var lines = parent.querySelector(".view-lines");
		if (lines === null) {
			console.log('Cannot find lines');
			return;
		} else {
			if (this._expandFlag) {
				//this._editor.setValue(" ".repeat(250) + "\n" + this._editor.getValue());
				this._expandFlag = false;
			}
			/* var emptyPlaceHolder = document.createElement("span");
			emptyPlaceHolder.innerText = "&nbsp;".repeat(50);
			emptyPlaceHolder.className = "mtk1";
			console.log(emptyPlaceHolder, lines.firstChild?.firstChild);
			lines.firstChild?.firstChild?.appendChild(emptyPlaceHolder); */
		}
	}

	private createExplainer(diff: string, startLine: number, generatedCodeLength: number = 0) {
		this.disposeExplanations();
		var eachLine = diff.split("\n");
		this._boxRange = [startLine, startLine + generatedCodeLength - 2];
		const editor_div = this._editor.getDomNode();
		if (editor_div === null) {
			throw new Error('Cannot find Monaco Editor');
		}
		var parent = editor_div.getElementsByClassName("overflow-guard");//"lines-content monaco-editor-background"
		var trueVisableEditor = parent[0].parentElement;
		this.expandEditor(parent[0]);

		var explainStart = getStartPos(eachLine);
		var editorWidth = Number(trueVisableEditor?.style.width.replace("px", ""));
		var explainWidth = editorWidth - explainStart;

		var lineHeight = 18,
			generateLine = generatedCodeLength - 1;
		console.log(generateLine);

		this.box = document.createElement('div');
		this.box.style.position = 'absolute';
		this.box.style.top = (startLine - 2) * lineHeight + 22 + 'px'; // offset from the run button + border + padding
		this.box.style.bottom = '14px'; // offset from the horizontal scroll bar (if any)
		this.box.style.left = explainStart + 'px';
		this.box.style.height = generateLine * lineHeight + 'px';
		this.box.className = "explainer-container";
		this.box.style.zIndex = '100';

		var border_div = document.createElement('div');
		border_div.style.float = 'left';
		border_div.style.width = '30px';
		border_div.style.height = generateLine * lineHeight + 'px';
		border_div.style.backgroundImage = 'linear-gradient(to right, rgba(60, 60, 60, 0), rgba(60, 60, 60, 1) 100%)';
		this.box.appendChild(border_div);
		border_div.addEventListener('mouseover', function (this) {
			this.style.backgroundImage = 'linear-gradient(to right, rgba(82, 139, 255, 0), rgba(82, 139, 255, 1) 100%)';
		});
		border_div.addEventListener('mouseout', function (this) {
			this.style.backgroundImage = 'linear-gradient(to right, rgba(60, 60, 60, 0), rgba(60, 60, 60, 1) 100%)';
		});

		var content_div = document.createElement('div');
		content_div.style.width = explainWidth - 30 + 'px';
		content_div.style.height = generateLine * lineHeight + 'px';
		content_div.style.float = 'right';
		content_div.style.backgroundColor = 'rgba(60, 60, 60, 1)';
		content_div.style.boxSizing = 'border-box';
		content_div.style.display = 'block';
		this.box.appendChild(content_div);
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
		this._summaryArr.then(function (value) {
			if (value === undefined) {
				return;
			}
			drawBends(content_div, value, lineHeight);
		});
		parent[0].insertBefore(this.box, parent[0].firstChild);
	}

	public dispose(): void {
		console.log("disposed");
		if (document.getElementById("explainer_container") !== null) {
			return;
		} else {
			this.box.remove();
		}
	}
}
registerEditorContribution(Explainer.ID, Explainer, EditorContributionInstantiation.BeforeFirstInteraction);
