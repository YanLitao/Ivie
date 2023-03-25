import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { OpenaiFetchAPI, drawBends } from 'vs/workbench/services/editor/browser/codexExplainer';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
//import { IScrollEvent } from 'vs/editor/common/editorCommon';

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

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	constructor(
		private readonly _editor: ICodeEditor,
		private box: HTMLDivElement,
		private _boxRange: undefined | [number, number],
		private _ghostTextController: GhostTextController | null,
		private _summaryArr: Promise<void | [number, number, string][]>,
		//private _expandFlag: boolean,
		private _boxOriginalPostion: number,
	) {
		//this._expandFlag = true;
		this._editor.onDidScrollChange(() => { this.onDidScrollChange(); });
		this._editor.onKeyDown(() => { this.onKeyDown(); });
		this._editor.onKeyUp(() => { this.onKeyUp(); });
		this._editor.onDidDispose(() => { this.dispose(); });
		this._editor.onMouseDown(() => { this.onMouseDown(); });
		this._editor.onDidLayoutChange(() => { this.onLayoutChange(); });
		this._editor.onDidContentSizeChange(() => { this.onContentSizeChange(); });
		this._ghostTextController = GhostTextController.get(this._editor);
		if (this._ghostTextController == null) {
			return;
		} else {
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

	private onDidScrollChange() {
		if (this.box) {
			this.box.style.top = this._boxOriginalPostion - this._editor.getScrollTop() + "px";
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
		var ghostText = activeModel?.inlineCompletionsModel.ghostText?.parts[0].lines;
		var generatedCode = ghostText?.join("\n");
		if (ghostText === undefined || generatedCode === undefined) {
			return;
		}
		var generatedCodeLength = generatedCode.split("\n").length;
		var mousePos = this._editor.getPosition();
		async function getExplain(text: string, type: string = 'multi', currentLine: string = "") {
			var summaryArr = await OpenaiFetchAPI(text, type, currentLine);
			return summaryArr;
		}
		var explainType = 'multi';
		if (ghostText.length == 1) {
			explainType = 'single';
			if (mousePos !== null) {
				var this_line = this._editor.getValue().split("\n")[mousePos.lineNumber - 1];
				this._summaryArr = getExplain(generatedCode, explainType, this_line);
				this.createExplainer(generatedCode, mousePos.lineNumber, generatedCodeLength);
			} else {
				return;
			}
		} else {
			if (mousePos !== null) {
				this._summaryArr = getExplain(generatedCode);
				this.createExplainer(generatedCode, mousePos.lineNumber, generatedCodeLength);
			}
		}
	}

	private onKeyUp() {
	}

	private onKeyDown() {
		var mousePos = this._editor.getPosition();
		if (mousePos !== null && this._boxRange !== undefined) {
			if (mousePos.lineNumber < this._boxRange[0] || mousePos.lineNumber > this._boxRange[1]) {
				this.disposeExplanations();
			}
		}
	}

	/* private expandEditor(parent: Element) {
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
				//this._editor.setValue(this._editor.getValue() + "\n" + " ".repeat(250));
				this._expandFlag = false;
			}
			var emptyPlaceHolder = document.createElement("span");
			emptyPlaceHolder.innerText = "&nbsp;".repeat(50);
			emptyPlaceHolder.className = "mtk1";
			console.log(emptyPlaceHolder, lines.firstChild?.firstChild);
			lines.firstChild?.firstChild?.appendChild(emptyPlaceHolder);
		}
	} */

	private createSingleExplainer(bends: [number, number, string][], contentDiv: HTMLDivElement, borderDiv: HTMLDivElement, lineHeight: number) {
		var lastIdx = -1,
			heighArry = [];
		var colorHue = ["rgb(114,217,88)", "rgb(216,138,237)", "rgb(194,223,65)", "rgb(117,167,240)", "rgb(222,188,62)", "rgb(95,220,169)", "rgb(235,150,83)", "rgb(189,205,114)"];
		for (var i = 0; i < bends.length; i++) {
			var newBend = document.createElement("div"),
				codeLine = document.createElement("div");
			newBend.className = 'bend';
			newBend.id = 'bend' + i;

			codeLine.className = 'codeLine';
			codeLine.id = 'codeLine' + i;
			codeLine.style.width = (bends[i][1] - bends[i][0] + 1) * 7.225 + 'px';
			codeLine.style.marginLeft = (bends[i][0] - lastIdx - 1) * 7.225 + 'px';
			codeLine.style.height = '5px';
			codeLine.style.float = 'left';
			codeLine.style.display = 'inline-block';
			codeLine.style.borderTop = '2px solid ' + colorHue[i % colorHue.length];
			codeLine.style.boxSizing = 'border-box';

			if (20 > bends[i][2].length) {
				newBend.style.width = bends[i][2].length * 7.225 + 'px';
			} else {
				newBend.style.width = '150px';
			}
			newBend.style.backgroundColor = 'rgb(40, 44, 52, 1)'; //132,194,214,0.2
			newBend.style.borderTop = '2px solid ' + colorHue[i % colorHue.length];
			newBend.style.boxSizing = 'border-box';
			newBend.innerText = bends[i][2];
			newBend.style.fontSize = '10px';
			newBend.style.float = 'left';
			newBend.style.marginLeft = '5px';
			newBend.style.display = 'inline-block';
			newBend.style.whiteSpace = 'pre-wrap';
			newBend.style.wordWrap = 'break-word';
			newBend.style.paddingLeft = '5px';
			newBend.style.paddingRight = '5px';

			/* newBend.style.width = (bends[i][1] - bends[i][0] + 1) * 7.225 + 'px';
			newBend.style.minHeight = '50px';
			newBend.style.marginLeft = (bends[i][0] - lastIdx - 1) * 7.225 + 'px';*/
			contentDiv.appendChild(newBend);
			borderDiv.appendChild(codeLine);
			heighArry.push(newBend.offsetHeight);
			lastIdx = bends[i][1];
		}
		contentDiv.style.height = Math.max(...heighArry) + 'px';
		if (contentDiv.parentElement) {
			contentDiv.parentElement.style.height = Math.max(...heighArry) + 'px';
		}
		contentDiv.querySelectorAll<HTMLElement>('.bend').forEach((newBend) => {
			newBend.addEventListener('mouseover', () => {
				var bendId = newBend.id;
				contentDiv.querySelectorAll<HTMLElement>('.bend').forEach((bend) => {
					if (bend.id !== bendId) {
						bend.style.backgroundColor = 'rgb(40, 44, 52, 0.6)';
						bend.style.color = "rgb(60, 60, 60, 0.1)";
						bend.style.borderTop = '2px solid rgb(60, 60, 60, 0.6)';
						var codeLineDiv = borderDiv.querySelector<HTMLElement>("#codeLine" + bend.id.replace("bend", ""));
						console.log("#codeLine" + bend.id.replace("bend", ""), codeLineDiv);
						if (codeLineDiv) {
							codeLineDiv.style.borderTop = '2px solid rgb(60, 60, 60, 0.6)';
						}
					}
				});
			});
		});
		contentDiv.querySelectorAll<HTMLElement>('.bend').forEach((newBend) => {
			newBend.addEventListener('mouseout', () => {
				contentDiv.querySelectorAll<HTMLElement>('.bend').forEach((bend) => {
					bend.style.backgroundColor = 'rgb(40, 44, 52, 1)';
					var idx = parseInt(bend.id.replace("bend", ""));
					bend.style.color = "rgb(212,212,212,1)";
					bend.style.borderTop = '2px solid ' + colorHue[idx % colorHue.length];
					var codeLineDiv = borderDiv.querySelector<HTMLElement>("#codeLine" + idx);
					if (codeLineDiv) {
						codeLineDiv.style.borderTop = '2px solid ' + colorHue[idx % colorHue.length];
					}
				});
			});
		});
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
		//this.expandEditor(parent[0]);

		var explainStart = getStartPos(eachLine);
		var editorWidth = Number(trueVisableEditor?.style.width.replace("px", ""));
		var explainWidth = editorWidth - explainStart;

		var lineHeight = 18,
			generateLine = generatedCodeLength;

		this.box = document.createElement('div');
		this.box.style.position = 'absolute';
		this.box.className = "explainer-container";
		this.box.style.zIndex = '100';

		var border_div = document.createElement('div');

		var content_div = document.createElement('div');
		content_div.style.backgroundColor = 'rgba(40, 44, 52, 0)'; //60, 60, 60, 1
		content_div.style.boxSizing = 'border-box';
		content_div.style.display = 'block';

		var type = "multi";
		if (generateLine > 1) {
			this._boxOriginalPostion = (startLine - 2) * lineHeight + 18;
			this.box.style.top = this._boxOriginalPostion + 'px';
			this.box.style.left = explainStart + 'px';
			this.box.style.height = generateLine * lineHeight + 'px';
			border_div.style.height = generateLine * lineHeight + 'px';
			border_div.style.float = 'left';
			border_div.style.width = '30px';
			border_div.style.backgroundImage = 'linear-gradient(to right, rgba(40, 44, 52, 0), rgba(40, 44, 52, 1) 100%)';//60, 60, 60
			content_div.style.height = generateLine * lineHeight + 'px';
			content_div.style.width = explainWidth - 30 + 'px';
			content_div.style.float = 'right';
		} else {
			this._boxOriginalPostion = (startLine - 1) * lineHeight + 16;
			this.box.style.top = this._boxOriginalPostion + 'px';
			this.box.style.left = '66px';
			border_div.style.height = '7px';
			content_div.style.width = explainWidth + 'px';
			border_div.style.width = explainWidth + 'px';
			type = "single";
		}
		this.box.appendChild(border_div);
		if (type == "multi") {
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
			border_div.addEventListener('mouseover', function (this) {
				this.style.backgroundImage = 'linear-gradient(to right, rgba(82, 139, 255, 0), rgba(82, 139, 255, 1) 100%)';
			});
			border_div.addEventListener('mouseout', function (this) {
				this.style.backgroundImage = 'linear-gradient(to right, rgba(40, 44, 52, 0), rgba(40, 44, 52, 1) 100%)';//60, 60, 60
			});
		}

		this.box.appendChild(content_div);

		this._summaryArr.then((value) => {
			if (value === undefined) {
				return;
			}
			if (type == "single") {
				this.createSingleExplainer(value, content_div, border_div, lineHeight);
			} else {
				drawBends(content_div, value, lineHeight, type);
			}
		});
		parent[0].insertBefore(this.box, parent[0].firstChild);
		this.onDidScrollChange();
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
