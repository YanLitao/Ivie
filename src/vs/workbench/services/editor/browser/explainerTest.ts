import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { OpenaiFetchAPI, drawBends, OpenaiStreamAPI, animateDots } from 'vs/workbench/services/editor/browser/codexExplainer';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
//import { IContentSizeChangedEvent } from 'vs/editor/common/editorCommon';
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

function isComment(line: string) {
	if (!line.trim()) return true;
	if (line.trim().startsWith("#")) return true;
	if (line.trim().startsWith("'''")) return true;
	if (line.trim().startsWith('"""')) return true;
	if (line.trim().startsWith("//")) return true;
	if (line.trim().startsWith("/*")) return true;
	if (line.trim().startsWith("*")) return true;
	if (line.trim().startsWith("*/")) return true;
	if (line.trim().startsWith("<!--")) return true;
	if (line.trim().startsWith("-->")) return true;
	return false;
}

function getStartPos(textArray: string[]) {
	var lengthArray = [];
	for (var i = 0; i < textArray.length; i++) {
		lengthArray.push(textArray[i].length);
	}
	var lines = staticsLength(lengthArray);
	if (lines === undefined) {
		return 80 * 7.225;
	}
	var max = lines.max;
	if (max >= 80) {
		return 80 * 7.225;
	} else {
		return max * 7.225;
	}
}

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	constructor(
		private readonly _editor: ICodeEditor,
		private editorDiv = _editor.getDomNode(),
		private parent: HTMLCollectionOf<Element>,
		private box: HTMLDivElement | undefined = undefined,
		private box2: HTMLDivElement | undefined = undefined,
		private borderDiv: HTMLDivElement | undefined = undefined,
		private contentDiv: HTMLDivElement | undefined = undefined,
		private borderDivMulti: HTMLDivElement | undefined = undefined,
		private contentDivMulti: HTMLDivElement | undefined = undefined,
		private lineHeight: number,
		private _boxRange: undefined | [number, number],
		private _ghostTextController: GhostTextController | null,
		private _summaryArr: Promise<void | [number, number, string][]>,
		private _multiSingleExplain: { [lineNb: string]: void | [number, number, string][] },
		//private _expandFlag: boolean,
		private _boxOriginalPostion: number,
		private _box2OriginalPostion: number,
		private _coloredOneLineFlag: boolean,
		private _multiLineStreamFlag: boolean,
		private _disposeFlag: boolean,
		private _lastGeneratedCode: string,
		private _explainerIdx: number,
		private _lastHoveredBend: number,
		private records: {
			time: string,
			ghostTopPx: number,
			ghostBottomPx: number,
			explainerTopNum: number,
			explainerBottomNum: number,
			explainerLeftPx: number,
			explainerRightPx: number,
			explainerTopPx: number,
			explainerBottomPx: number,
			singleExplainerTopPx: number,
			singleExplainerBottomPx: number,
			singleExplainerLeft: number,
			singleExplainerRight: number
		}[] = []
	) {
		this._explainerIdx = 0;
		this._lastGeneratedCode = "";
		//this._expandFlag = true;
		this.lineHeight = 18;
		this._disposeFlag = true;
		this._coloredOneLineFlag = true;
		this._multiLineStreamFlag = true;
		this._lastHoveredBend = -1;
		this._editor.onDidScrollChange(() => { this.onDidScrollChange(); });
		this._editor.onKeyDown(() => { this.onKeyDown(); });
		this._editor.onKeyUp(() => { this.onKeyUp(); });
		this._editor.onDidDispose(() => { this.dispose(); });
		this._editor.onMouseDown(() => { this.onMouseDown(); });
		this._editor.onMouseMove((e: IEditorMouseEvent) => { this.onMouseMove(e); });
		this._editor.onDidLayoutChange(() => { this.onLayoutChange(); });
		//this._editor.onDidContentSizeChange((e: IContentSizeChangedEvent) => { this.onContentSizeChange(e); });
		this._ghostTextController = GhostTextController.get(this._editor);
		this._editor.onDidBlurEditorText(() => { this.onDidChangeModel(); });
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

	private onDidChangeModel() {
		console.log(this.records);
	}

	private recordGeneratedCode() {
		var time = new Date();
		let currentTime: string = time.toLocaleTimeString('en-US', { hour12: false });
		let millis = time.getUTCMilliseconds()
		var recordTime = currentTime + ":" + String(millis);
		var defaultLeft = 48;
		var defaultTop = 85;

		if (this._boxRange === undefined) {
			var explainerTopNum = -1;
			var explainerBottomNum = -1;
		} else {
			var explainerTopNum = this._boxRange[0];
			var explainerBottomNum = this._boxRange[1];
		}

		if (this.box === undefined) {
			return;
		} else {
			var explainerHeight = Number(this.box.style.height.replace("px", ""));
			var boxTop = Number(this.box.style.top.replace("px", "")) + defaultTop;
			var boxBottom = boxTop + explainerHeight;
			var boxLeft = Number(this.box.style.left.replace("px", "")) + defaultLeft;
			var boxRight = boxLeft + this.box.offsetWidth;
			var explainerBottom = boxTop + (explainerBottomNum - explainerTopNum + 1) * this.lineHeight;
		}

		if (this.box2 === undefined) {
			var singleExplainerTopPx = -1;
			var singleExplainerBottomPx = -1;
			var singleExplainerLeft = -1;
			var singleExplainerRight = -1;
		} else {
			var singleExplainerTopPx = Number(this.box2.style.top.replace("px", "")) + defaultTop;
			var singleExplainerBottomPx = singleExplainerTopPx + Number(this.box2.style.height.replace("px", ""));
			var singleExplainerLeft = Number(this.box2.style.left.replace("px", "")) + defaultLeft;
			var singleExplainerRight = singleExplainerLeft + Number(this.box2.style.width.replace("px", ""));
		}
		var newRecord = {
			"time": recordTime,
			"ghostTopPx": boxTop,
			"ghostBottomPx": explainerBottom,
			"explainerTopNum": explainerTopNum,
			"explainerBottomNum": explainerBottomNum,
			"explainerTopPx": boxTop,
			"explainerBottomPx": boxBottom,
			"explainerLeftPx": boxLeft,
			"explainerRightPx": boxRight,
			"singleExplainerTopPx": singleExplainerTopPx,
			"singleExplainerBottomPx": singleExplainerBottomPx,
			"singleExplainerLeft": singleExplainerLeft,
			"singleExplainerRight": singleExplainerRight
		};
		this.records.push(newRecord);
	}

	private disposeExplanations() {
		this.dispose();
		var last_explain = document.getElementsByClassName("explainer-container");
		for (var i = 0; i < last_explain.length; i++) {
			last_explain[i].remove();
			this._boxRange = undefined;
		}
		this._disposeFlag = true;
	}

	private onMouseDown() {
		var mousePos = this._editor.getPosition();
		if (mousePos !== null && this._boxRange !== undefined) {
			if (mousePos.lineNumber < this._boxRange[0] || mousePos.lineNumber > this._boxRange[1]) {
				this.disposeExplanations();
			}
		}
	}

	private hideMultiExplainer(startY: number) {
		if (this.borderDiv !== undefined) {
			this.borderDiv.style.opacity = "0";
		}
		var endY = startY + this.lineHeight;
		var allBends = document.getElementsByClassName("bend");
		var h = Number(this.box?.style.top.replace("px", ""));
		for (var i = 0; i < allBends.length; i++) {
			var bend = allBends[i] as HTMLElement;
			if (bend !== undefined) {
				h = h + Number(bend.style.marginTop.replace("px", ""))
				var a = h;
				var b = Number(bend.offsetHeight) + a;
				if ((a <= startY && b >= startY) ||
					(a <= endY && b >= endY) ||
					(a >= startY && b <= endY)) {
					bend.style.opacity = "0";
				}
				h = b
			}
		}
	}

	private onMouseMove(mouseEvent: IEditorMouseEvent) {
		if (mouseEvent.target === null || this._boxRange === undefined || this.box2 === undefined) {
			return;
		}
		if (this.contentDivMulti === undefined || this.borderDivMulti === undefined) {
			return;
		}
		var target = mouseEvent.target.element;
		if (target?.className == "MultiSingleExplainer" || target?.className == "bend") {
			this.box2.style.display = "block";
			return;
		}
		//var visableStart = this._editor.getVisibleRanges()[0].startLineNumber;
		var PosY = mouseEvent.event.posy;
		var currentToTop = this._editor.getScrollTop();
		//var invisHeight = visableStart * this.lineHeight - currentToTop;
		var realLineNum = Math.ceil((currentToTop + PosY - 85) / this.lineHeight);
		//var realLineNum = visableLineNum + visableStart;
		//var currentLineTop = (visableLineNum - visableStart) * this.lineHeight + invisHeight;
		if (realLineNum < this._boxRange[0] || realLineNum > this._boxRange[1]) {
			this.box2.style.display = "none";
			var allBends = document.getElementsByClassName("bend");
			for (var i = 0; i < allBends.length; i++) {
				var bend = allBends[i] as HTMLElement;
				bend.style.opacity = "1";
			}
			if (this.borderDiv !== undefined) {
				this.borderDiv.style.opacity = "1";
			}
			this.recordGeneratedCode();
			return;
		} else if (this._lastHoveredBend !== realLineNum || document.getElementById("placeholderMulti") !== null) {
			this._lastHoveredBend = realLineNum;
			this.createSingleInMultiExplainer(this.parent[0]);
			this.box2.style.top = realLineNum * this.lineHeight + 2 - currentToTop + 'px';
			this._box2OriginalPostion = realLineNum * this.lineHeight + 2;
			var lineNb = String(realLineNum);
			if (this._multiSingleExplain && lineNb in this._multiSingleExplain) {
				var explainArr = this._multiSingleExplain[lineNb];
				if (explainArr !== undefined) {
					this.createSingleExplainer(explainArr, realLineNum, this.contentDivMulti, this.borderDivMulti);
				}
			}
			this.box2.style.display = "block";
			var allBends = document.getElementsByClassName("bend");
			for (var i = 0; i < allBends.length; i++) {
				var bend = allBends[i] as HTMLElement;
				bend.style.opacity = "1";
			}
			this.hideMultiExplainer(PosY - 85);
			this.recordGeneratedCode();
		} else {
			this.box2.style.display = "block";
		}
	}

	private onDidScrollChange() {
		if (this.box) {
			this.box.style.top = this._boxOriginalPostion - this._editor.getScrollTop() + "px";
		}
		if (this.box2) {
			this.box2.style.top = this._box2OriginalPostion - this._editor.getScrollTop() + "px";
			this.box2.style.left = 66 - this._editor.getScrollLeft() + "px";
		}
		if (this.box?.classList.contains("single")) {
			this.box.style.left = 66 - this._editor.getScrollLeft() + "px";
		}
		this.recordGeneratedCode();
	}

	private onLayoutChange() {
		//console.log(this._editor.getLayoutInfo(), this._editor.getContentWidth());
	}

	private async getExplain(text: string, div: HTMLDivElement, multiLineStreamFlag: boolean, type: string = 'multi', numberSections: number = 1) {
		if (type == "multi" && multiLineStreamFlag) {
			OpenaiStreamAPI(text, div, numberSections);
			var eachLine = text.split("\n");
			for (var i = 0; i < eachLine.length; i++) {
				var lineTrimed = eachLine[i].trim();
				if (lineTrimed == undefined || isComment(lineTrimed)) continue;
				var summaryArrEach = await OpenaiFetchAPI(eachLine[i], "single");
				console.log(summaryArrEach);
			}
		};
		if (multiLineStreamFlag == false || type == "single") {
			var summaryArr = await OpenaiFetchAPI(text, type);
			return summaryArr;
		}
	}

	/* private async getExplain2(text: string, div: HTMLDivElement, currentLine: number, numberSections: number = 1) {
		let summaryLines: Record<string, void | [number, number, string][]> = {};
		const eachLine = text.split("\n");
		for (let i = 0; i < eachLine.length; i++) {
			let lineTrimed = eachLine[i].trim();
			if (lineTrimed == undefined || isComment(lineTrimed)) continue;
			let summaryArrEach = await OpenaiFetchAPI(eachLine[i], "single", eachLine[i]);
			let lineNb = String(currentLine + i); // Assuming currentLine is defined elsewhere
			summaryLines[lineNb] = summaryArrEach;
		}
		return summaryLines;
	} */

	private ghostTextChange() {
		if (this._disposeFlag == false) return;
		const activeModel = this._ghostTextController?.activeModel;
		var ghostText = activeModel?.inlineCompletionsModel.ghostText?.parts[0].lines;
		var generatedCode = ghostText?.join("\n");
		if (ghostText === undefined || generatedCode === undefined || generatedCode.trim() == "") {
			this.disposeExplanations();
			return;
		}
		if (generatedCode.trim() == this._lastGeneratedCode.trim() && this.box !== undefined) {
			return;
		}
		this._lastGeneratedCode = generatedCode.trim();
		var generatedCodeLength = generatedCode.split("\n").length;
		var mousePos = this._editor.getPosition();
		if (mousePos == null) return;
		if (this.editorDiv === null) return;
		this.parent = this.editorDiv.getElementsByClassName("overflow-guard");
		var this_line = this._editor.getValue().split("\n")[mousePos.lineNumber - 1];
		generatedCode = this_line + generatedCode;
		if (ghostText.length == 1) {
			var explainType = 'single';
			if (isComment(generatedCode)) {
				return;
			};
		} else {
			var explainType = 'multi';
		}
		var currentIdx = this.createExplainer(generatedCode, this.parent, explainType, mousePos.lineNumber, generatedCodeLength);
		if (this.box === undefined) return;
		this.parent[0].insertBefore(this.box, this.parent[0].firstChild);
		this.onDidScrollChange();

		if (this.contentDiv === undefined) return;

		if (explainType == "single") {
			this._summaryArr = this.getExplain(generatedCode, this.contentDiv, this._multiLineStreamFlag, explainType);
			this._summaryArr.then((value) => {
				if (this.contentDiv === undefined) return;
				if (value === undefined) {
					return;
				}
				if (this._coloredOneLineFlag && this.borderDiv !== undefined) {
					this.createSingleExplainer(value, currentIdx);
				} else {
					drawBends(currentIdx, value, this.lineHeight, explainType, this.contentDiv.offsetWidth);
				}
				this.recordGeneratedCode();
			});
		} else {
			this._multiSingleExplain = {};
			this.createSingleInMultiExplainer(this.parent[0]);
			var numberSections = 3,
				realCode = 0;
			var splitLines = generatedCode.split("\n");
			for (var i = 0; i < splitLines.length; i++) {
				if (isComment(splitLines[i]) == false) {
					realCode += 1;
					let lineNb = String(mousePos.lineNumber + i);
					let summaryArrEach = OpenaiFetchAPI(splitLines[i], "single");
					summaryArrEach.then((value) => {
						if (value) {
							this._multiSingleExplain[lineNb] = value;
						}
					});
				}
			}
			if (realCode > 12) {
				var numberSections = Math.ceil(realCode / 4);
			} else if (realCode > 4) {
				var numberSections = 3;
			} else {
				var numberSections = 2;
			}
			generatedCode = this_line + generatedCode;
			OpenaiStreamAPI(generatedCode, this.contentDiv, numberSections);
			this.recordGeneratedCode();
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

	private createSingleExplainer(bends: [number, number, string][], currentIdx: number, contentDiv?: HTMLElement, borderDiv?: HTMLElement) {
		var lastIdx = -1,
			heighArry = [];
		if (contentDiv === undefined) {
			var contentDivTemp = document.getElementById("contentDiv" + currentIdx);
			if (contentDivTemp === null) return;
			contentDiv = contentDivTemp;
		} else {
			// remove the placeholder inside contenDiv
			document.getElementById("placeholderMulti")?.remove();
		}
		if (borderDiv === undefined) {
			var borderDivTemp = document.getElementById("borderDiv" + currentIdx);
			if (borderDivTemp === null) return;
			borderDiv = borderDivTemp;
		}
		if (contentDiv === null || borderDiv === null) return;
		var colorHue = ["rgb(185,170,135)", "rgb(151,175,189)", "rgb(202,161,163)", "rgb(112,181,201)", "rgb(160,176,153)", "rgb(171,167,207)", "rgb(140,179,171)", "rgb(191,163,189)"];
		var bendWidth = 100,
			codeTextRatio = 7.225,
			labelTextRatio = 5.5,
			paddingSize = 5;
		var nextPos = bends[0][0] * codeTextRatio;
		var numberInLabel = Math.ceil((bendWidth - paddingSize * 2) / labelTextRatio);
		for (var i = 0; i < bends.length; i++) {
			var newBend = document.createElement("div"),
				codeLine = document.createElement("div");
			newBend.className = 'bendSingle';
			newBend.id = 'bend_' + currentIdx + "_" + i;

			codeLine.className = 'codeLine';
			codeLine.id = 'codeLine' + i;
			codeLine.style.width = (bends[i][1] - bends[i][0] + 1) * 7.225 + 'px';
			codeLine.style.marginLeft = (bends[i][0] - lastIdx - 1) * 7.225 + 'px';
			codeLine.style.height = '1px';
			codeLine.style.float = 'left';
			codeLine.style.display = 'inline-block';
			codeLine.style.borderTop = '2px solid ' + colorHue[i % colorHue.length];
			codeLine.style.boxSizing = 'border-box';

			newBend.style.backgroundColor = 'rgb(37, 40, 57, 1)'; //132,194,214,0.2
			newBend.style.borderTop = '2px solid ' + colorHue[i % colorHue.length];
			newBend.style.boxSizing = 'border-box';
			newBend.innerText = bends[i][2];
			newBend.style.fontSize = '10px';
			newBend.style.float = 'left';

			if (numberInLabel > bends[i][2].length) {
				var labelWidth = bends[i][2].length * labelTextRatio + 10;
				newBend.style.width = labelWidth + 'px';
				var diffPos = bends[i][0] * codeTextRatio - nextPos;
				if (diffPos >= 0) {
					if (i == 0) {
						newBend.style.marginLeft = bends[i][0] * codeTextRatio + 'px';
					} else {
						newBend.style.marginLeft = diffPos + 'px';
					}
					nextPos = bends[i][0] * codeTextRatio + labelWidth;
				} else {
					newBend.style.marginLeft = '3px';
					nextPos = nextPos + 3 + labelWidth;
				}
			} else {
				var labelWidth = bendWidth;
				newBend.style.width = labelWidth + 'px';
				var diffPos = bends[i][0] * codeTextRatio - nextPos;
				if (diffPos >= 0) {
					if (i == 0) {
						newBend.style.marginLeft = bends[i][0] * codeTextRatio + 'px';
					} else {
						newBend.style.marginLeft = diffPos + 'px';
					}
					nextPos = bends[i][0] * codeTextRatio + labelWidth;
				} else {
					newBend.style.marginLeft = '3px';
					nextPos = nextPos + 3 + labelWidth;
				}
			}
			newBend.style.display = 'inline-block';
			newBend.style.whiteSpace = 'pre-wrap';
			newBend.style.paddingLeft = paddingSize + 'px';
			newBend.style.paddingRight = paddingSize + 'px';

			contentDiv?.appendChild(newBend);
			borderDiv?.appendChild(codeLine);
			heighArry.push(newBend.offsetHeight);
			lastIdx = bends[i][1];
		}
		contentDiv.style.height = Math.max(...heighArry) + 'px';
		if (contentDiv.parentElement) {
			contentDiv.parentElement.style.height = Math.max(...heighArry) + 'px';
		}
		contentDiv.querySelectorAll<HTMLElement>('.bendSingle').forEach((newBend) => {
			newBend.addEventListener('mouseover', () => {
				var bendId = newBend.id;
				var regenerateBends = newBend.querySelector<HTMLElement>('.regenerateBend');
				if (regenerateBends) {
					regenerateBends.style.display = 'block';
				}
				contentDiv?.querySelectorAll<HTMLElement>('.bendSingle').forEach((bend) => {
					if (bend.id !== bendId) {
						bend.style.backgroundColor = 'rgb(37, 40, 57, 0.8)';
						bend.style.color = "rgb(60, 60, 60, 0.8)";
						bend.style.borderTop = '2px solid rgb(60, 60, 60, 0.8)';
						var codeLineDiv = borderDiv?.querySelector<HTMLElement>("#codeLine" + bend.id.split("_")[2]);
						if (codeLineDiv) {
							codeLineDiv.style.borderTop = '2px solid rgb(60, 60, 60, 0.8)';
						}
					}
				});
			});
			newBend.addEventListener('mouseout', () => {
				var regenerateBends = newBend.querySelector<HTMLElement>('.regenerateBend');
				if (regenerateBends) {
					regenerateBends.style.display = 'none';
				}
				contentDiv?.querySelectorAll<HTMLElement>('.bendSingle').forEach((bend) => {
					bend.style.backgroundColor = 'rgb(37, 40, 57, 1)';
					var bendIdx = parseInt(bend.id.split("_")[2]);
					bend.style.color = "rgb(212,212,212,1)";
					bend.style.borderTop = '2px solid ' + colorHue[bendIdx % colorHue.length];
					var codeLineDiv = borderDiv?.querySelector<HTMLElement>("#codeLine" + bendIdx);
					if (codeLineDiv) {
						codeLineDiv.style.borderTop = '2px solid ' + colorHue[bendIdx % colorHue.length];
					}
				});
			});
		});
		/* contentDiv.querySelectorAll<HTMLElement>('.regenerateBend').forEach((regenerateDiv) => {
			regenerateDiv.addEventListener('mouseover', (event) => {
				var target = event.target as HTMLElement;
				var bendDiv = document.getElementById("bend_" + target?.id.split("_")[1] + "_" + target?.id.split("_")[2]);
				console.log(target, target?.id, bendDiv?.innerText);
			});
		}); */
	}

	private createSingleInMultiExplainer(parent: Element) {
		this.box2?.remove();
		this.box2 = undefined;
		this.contentDivMulti?.remove();
		this.contentDivMulti = undefined;
		this.borderDivMulti?.remove();
		this.borderDivMulti = undefined;

		this.box2 = document.createElement('div');
		this.box2.id = "single_container_in_multi";
		this.box2.className = "MultiSingleExplainer";
		this.box2.style.position = 'absolute';
		this.box2.style.backgroundColor = 'rgb(37, 40, 57, 0.2)';
		this.box2.style.top = 1500 + 'px';
		this.box2.style.left = '66px';
		this.box2.style.width = '1500px';
		this.box2.style.height = '100px';
		this.box2.style.display = "none";
		this.box2.style.zIndex = '110';

		this.borderDivMulti = document.createElement('div');
		this.borderDivMulti.id = "borderDivMulti";
		this.borderDivMulti.className = "MultiSingleExplainer";
		this.borderDivMulti.style.width = '1500px';
		this.borderDivMulti.style.height = '3px';
		this.box2.appendChild(this.borderDivMulti);

		this.contentDivMulti = document.createElement('div');
		this.contentDivMulti.id = "contentDivMulti";
		this.contentDivMulti.className = "MultiSingleExplainer";
		this.contentDivMulti.style.backgroundColor = 'rgba(37, 40, 57, 0.2)'; //60, 60, 60, 1
		this.contentDivMulti.style.boxSizing = 'border-box';
		this.contentDivMulti.style.display = 'block';
		this.contentDivMulti.style.width = '1500px';

		var placeholder = document.createElement('div');
		placeholder.id = "placeholderMulti";
		placeholder.textContent = '...';
		placeholder.style.paddingLeft = '5px';
		placeholder.style.marginTop = '2px';
		placeholder.style.borderLeft = '1.5px solid white';
		this.contentDivMulti.appendChild(placeholder);
		animateDots(placeholder);

		this.box2.appendChild(this.contentDivMulti);
		parent.insertBefore(this.box2, parent.firstChild);
	}

	private createExplainer(diff: string, parent: HTMLCollectionOf<Element>, type: string, startLine: number, generatedCodeLength: number = 0) {
		this.disposeExplanations();
		var newIdx = this._explainerIdx;
		var eachLine = diff.split("\n");
		this._boxRange = [startLine, startLine + generatedCodeLength - 1];
		if (this.editorDiv === null) {
			throw new Error('Cannot find Monaco Editor');
		}

		var generateLine = generatedCodeLength;

		this.box = document.createElement('div');
		this.box.style.position = 'absolute';
		this.box.className = "explainer-container";
		if (type == "single") {
			this.box.classList.add("single");
		}
		this.box.style.zIndex = '100';
		this.box.id = "explainer" + newIdx;


		this.borderDiv = document.createElement('div');
		this.borderDiv.id = "borderDiv" + newIdx;

		this.contentDiv = document.createElement('div');
		this.contentDiv.id = "contentDiv" + newIdx;
		this.contentDiv.style.backgroundColor = 'rgba(37, 40, 57, 0.2)'; //60, 60, 60, 1
		this.contentDiv.style.boxSizing = 'border-box';
		this.contentDiv.style.display = 'block';

		if (type == "multi") {
			var explainStart = getStartPos(eachLine);
			var trueVisableEditor = this.parent[0].parentElement;
			var editorWidth = Number(trueVisableEditor?.style.width.replace("px", ""));
			var explainWidth = editorWidth - explainStart;
			this._boxOriginalPostion = (startLine - 1) * this.lineHeight;
			this.box.style.top = this._boxOriginalPostion + 'px';
			this.box.style.left = explainStart + 'px';
			this.box.style.height = generateLine * this.lineHeight + 'px';
			this.borderDiv.style.height = generateLine * this.lineHeight + 'px';
			this.borderDiv.style.float = 'left';
			this.borderDiv.style.width = '30px';
			this.borderDiv.style.backgroundImage = 'linear-gradient(to right, rgba(37, 40, 57, 0), rgba(37, 40, 57, 1) 100%)';//60, 60, 60
			this.contentDiv.style.height = generateLine * this.lineHeight + 'px';
			this.contentDiv.style.width = explainWidth - 30 + 'px';
			this.contentDiv.style.float = 'right';
		} else {
			this._boxOriginalPostion = (startLine - 1) * this.lineHeight + 16;
			this.box.style.top = this._boxOriginalPostion + 'px';
			this.box.style.left = '66px';
			this.borderDiv.style.height = '3px';
			this.contentDiv.style.width = '1500px';
			this.borderDiv.style.width = '1500px';
		}
		this.box.appendChild(this.borderDiv);
		if (type == "multi") {
			this.borderDiv.addEventListener('click', function (this) {
				if (this.parentElement) {
					var contentDiv = document.getElementById("contentDiv");
					if (contentDiv && contentDiv.style.display == 'none') {
						contentDiv.style.display = 'block';
						this.parentElement.style.left = explainStart + 'px';
					} else if (contentDiv) {
						this.parentElement.style.left = editorWidth - 30 + 'px';
						contentDiv.style.display = 'none';
					}
				}
			});
			/* this.borderDiv.addEventListener('mouseover', function (this) {
				this.style.backgroundImage = 'linear-gradient(to right, rgba(82, 139, 255, 0), rgba(82, 139, 255, 1) 100%)';
			});
			this.borderDiv.addEventListener('mouseout', function (this) {
				this.style.backgroundImage = 'linear-gradient(to right, rgba(40, 44, 52, 0), rgba(40, 44, 52, 1) 100%)';//60, 60, 60
			}); */
		}
		this.box.appendChild(this.contentDiv);
		return newIdx;
	}

	public dispose(): void {
		if (document.getElementById("explainer_container") !== null) {
			return;
		} else {
			if (this.box) {
				this.box.remove();
				this.box = undefined;
			}
			if (this.borderDiv) {
				this.borderDiv.remove();
				this.borderDiv = undefined;
			}
			if (this.contentDiv) {
				this.contentDiv.remove();
				this.contentDiv = undefined;
			}
			if (this.box2) {
				this.box2.remove();
				this.box2 = undefined;
			}
			if (this.borderDivMulti) {
				this.borderDivMulti.remove();
				this.borderDivMulti = undefined;
			}
			if (this.contentDivMulti) {
				this.contentDivMulti.remove();
				this.contentDivMulti = undefined;
			}
			this._explainerIdx += 1;
		}
	}
}
registerEditorContribution(Explainer.ID, Explainer, EditorContributionInstantiation.BeforeFirstInteraction);
