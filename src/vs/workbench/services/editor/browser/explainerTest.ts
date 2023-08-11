import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { OpenaiFetchAPI, drawBends, OpenaiStreamAPI, animateDots } from 'vs/workbench/services/editor/browser/codexExplainer';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
//import { IContentSizeChangedEvent } from 'vs/editor/common/editorCommon';

const staticsLength = (arr: number[]): { median: number; mean: number; min: number; max: number } => {
	var median = 0;
	var mean = 0;
	var min = 0;
	var max = 0;
	if (!arr.length) return { median, mean, min, max };
	const s = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);

	median = s.length % 2 === 0 ? ((s[mid - 1] + s[mid]) / 2) : s[mid];
	mean = s.reduce((a, b) => a + b) / s.length;
	min = s[0];
	max = s[s.length - 1];
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

function getStartPos(textArray: string[], require: string = "none") {
	var lengthArray = [];
	for (var i = 0; i < textArray.length; i++) {
		lengthArray.push(textArray[i].length);
	}
	var lines = staticsLength(lengthArray);
	if (lines === undefined) {
		return 80 * 7.5;
	}
	var max = lines.max;
	if (require == "wide") {
		var placeToStart = 100;
	} else {
		var placeToStart = 80;
	}
	if (max >= placeToStart) {
		return placeToStart * 7.5;
	} else {
		return max * 7.5;
	}
}

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	private box: HTMLDivElement | undefined = undefined;
	private box0: HTMLDivElement | undefined = undefined;
	private box1: HTMLDivElement | undefined = undefined;
	private box2: HTMLDivElement | undefined = undefined;
	private borderDiv: HTMLDivElement | undefined = undefined;
	private contentDiv: HTMLDivElement | undefined = undefined;
	private borderDiv0: HTMLDivElement | undefined = undefined;
	private contentDiv0: HTMLDivElement | undefined = undefined;
	private borderDivAll: HTMLDivElement | undefined = undefined;
	private contentDivAll: HTMLDivElement | undefined = undefined;
	private borderDivMulti: HTMLDivElement | undefined = undefined;
	private contentDivMulti: HTMLDivElement | undefined = undefined;
	private lineHeight: number = 18;
	private _boxRange: undefined | [number, number] = undefined;
	private _ghostTextController: GhostTextController | null = null;
	private _summaryArr: Promise<void | [number, number, string][]> | undefined = undefined;
	private _multiSingleExplain: { [lineNb: string]: void | [number, number, string][] } | undefined = undefined;
	private _allExplain: { [lineNb: string]: void | [number, number, string][] } | undefined = undefined;
	private _boxOriginalPostion: number = 0;
	private _box0OriginalPostion: number = 0;
	private _box1OriginalPostion: number = 0;
	private _box2OriginalPostion: number = 0;
	private _coloredOneLineFlag: boolean = true;
	private _multiLineStreamFlag: boolean = true;
	private _allModeFlag: boolean = true;
	private _disposeFlag: boolean = true;
	private generateBtn: HTMLDivElement = document.createElement("div");
	private _lastGeneratedCode: string = "";
	private _explainerIdx: number = 0;
	private _lastHoveredBend: number = -1;
	private _codeTextRatio: number = 7.225;
	private _guildLineHeight: number = 8;
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
	}[] = [];
	private parent: HTMLCollectionOf<Element> = document.getElementsByClassName("overflow-guard");
	constructor(
		private readonly _editor: ICodeEditor
		//private _expandFlag: boolean,
	) {
		this._editor.onDidScrollChange(() => { this.onDidScrollChange(); });
		this._editor.onKeyDown((e: IKeyboardEvent) => { this.onKeyDown(e); });
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
		this.editorDiv = this._editor.getDomNode();
		this.createGeneraterBtn();
	}

	private editorDiv = this._editor.getDomNode();
	private createGeneraterBtn() {
		document.getElementById("generateBtn")?.remove();
		if (this.editorDiv === undefined || this.editorDiv === null) {
			this.editorDiv = this._editor.getDomNode();
		};
		if (this.editorDiv !== null) {
			var editorParent = this.editorDiv.parentElement;
			if (editorParent !== null) {
				var editorParent1 = editorParent.parentElement;
				if (editorParent1 !== null) {
					var editorParent2 = editorParent1.parentElement;
					if (editorParent2 !== null) {
						editorParent2.insertBefore(this.generateBtn, editorParent2.firstChild);
					}
				} else {
					return;
				}
			} else {
				return;
			}
		}
		this.generateBtn.id = "generateBtn";
		this.generateBtn.style.position = "absolute";
		this.generateBtn.style.top = "35px";
		this.generateBtn.style.right = "0px";
		this.generateBtn.style.width = "20px";
		this.generateBtn.style.height = "20px";
		this.generateBtn.style.borderRadius = "5px";
		this.generateBtn.style.zIndex = "100";
		this.generateBtn.style.cursor = "pointer";
		this.generateBtn.style.textAlign = "center";
		this.generateBtn.style.lineHeight = "20px";
		this.generateBtn.style.fontSize = "12px";

		let svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svgElement.setAttributeNS(null, "x", "0px");
		svgElement.setAttributeNS(null, "y", "0px");
		svgElement.setAttributeNS(null, "viewBox", "0 0 1000 1000");
		svgElement.setAttributeNS(null, "enable-background", "new 0 0 1000 1000");
		svgElement.setAttributeNS(null, "width", "20");  // Adjusting the size to fit 20x20px
		svgElement.setAttributeNS(null, "height", "20");  // Adjusting the size to fit 20x20px
		svgElement.setAttributeNS(null, "fill", "rgb(65, 73, 107)");  // Icon color before hover

		// Create group element
		let gElement = document.createElementNS("http://www.w3.org/2000/svg", "g");

		// Create paths
		let paths = [
			"M263.1,331.6c33.8,0,61.2,27.4,61.2,61.2c0,33.9-27.4,61.3-61.2,61.3c-33.8,0-61.3-27.4-61.3-61.3C201.9,359,229.3,331.6,263.1,331.6z",
			"M508.2,331.6c33.9,0,61.3,27.4,61.3,61.2c0,33.9-27.4,61.3-61.3,61.3c-33.9,0-61.2-27.4-61.2-61.3C446.9,359,474.3,331.6,508.2,331.6z",
			"M753.2,331.6c33.8,0,61.3,27.4,61.3,61.2c0,33.9-27.5,61.3-61.3,61.3c-33.9,0-61.2-27.4-61.2-61.3C691.9,359,719.3,331.6,753.2,331.6z",
			"M845.9,25.3H154.1C74.5,25.3,10,89.7,10,169.1v460.4c0,79.4,64.5,143.9,144.1,143.9h288.3v201.4l331.5-201.4h72.1c79.6,0,144.1-64.4,144.1-143.9V169.1C990,89.7,925.5,25.3,845.9,25.3z M928.8,629.5c0,45.5-37.2,82.6-82.9,82.6h-72.1h-17.2l-14.6,8.9L503.6,865.9v-92.5v-61.3h-61.3H154.1c-45.7,0-82.9-37.1-82.9-82.6V169.1c0-45.5,37.2-82.5,82.9-82.5h691.9c45.7,0,82.9,37,82.9,82.5L928.8,629.5L928.8,629.5z"
		];

		for (let d of paths) {
			let pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
			pathElement.setAttributeNS(null, "d", d);
			pathElement.classList.add("pathIcons");
			gElement.appendChild(pathElement);
		}

		// Append group to SVG
		svgElement.appendChild(gElement);

		// Append SVG to generateBtn
		this.generateBtn.appendChild(svgElement);

		// hover effect
		this.generateBtn.addEventListener("mouseover", () => {
			var allPaths = document.getElementsByClassName("pathIcons");
			for (var i = 0; i < allPaths.length; i++) {
				allPaths[i].setAttributeNS(null, "fill", "rgb(121, 130, 169)");
			}
		});

		this.generateBtn.addEventListener("mouseout", () => {
			var allPaths = document.getElementsByClassName("pathIcons");
			for (var i = 0; i < allPaths.length; i++) {
				allPaths[i].setAttributeNS(null, "fill", "rgb(65, 73, 107)");
			}
		});

		this.generateBtn.addEventListener("click", () => {
			this.generateAllExplanations();
		});
	}
	private onDidChangeModel() {
		this.disposeExplanations();
		this.disposeAllExplainer();
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

		if (this.box !== undefined) {
			var explainerHeight = Number(this.box.style.height.replace("px", ""));
			var boxTop = Number(this.box.style.top.replace("px", "")) + defaultTop;
			var boxBottom = boxTop + explainerHeight;
			var boxLeft = Number(this.box.style.left.replace("px", "")) + defaultLeft;
			var boxRight = boxLeft + this.box.offsetWidth;
			var explainerBottom = boxTop + (explainerBottomNum - explainerTopNum + 1) * this.lineHeight;
		} else if (this.box0 !== undefined) {
			var explainerHeight = Number(this.box0.style.height.replace("px", ""));
			var boxTop = Number(this.box0.style.top.replace("px", "")) + defaultTop;
			var boxBottom = boxTop + explainerHeight;
			var boxLeft = Number(this.box0.style.left.replace("px", "")) + defaultLeft;
			var boxRight = boxLeft + this.box0.offsetWidth;
			var explainerBottom = boxTop + (explainerBottomNum - explainerTopNum + 1) * this.lineHeight;
		} else {
			return;
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

		if (this.box1 === undefined) {
			var singleExplainerTopPx = -1;
			var singleExplainerBottomPx = -1;
			var singleExplainerLeft = -1;
			var singleExplainerRight = -1;
		} else {
			var singleExplainerTopPx = Number(this.box1.style.top.replace("px", "")) + defaultTop;
			var singleExplainerBottomPx = singleExplainerTopPx + Number(this.box1.style.height.replace("px", ""));
			var singleExplainerLeft = Number(this.box1.style.left.replace("px", "")) + defaultLeft;
			var singleExplainerRight = singleExplainerLeft + Number(this.box1.style.width.replace("px", ""));
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
		}
		this._boxRange = undefined;
		this._disposeFlag = true;
	}

	private onMouseDown() {
		this.disposeAllExplainer();
		var mousePos = this._editor.getPosition();
		if (mousePos !== null && this._boxRange !== undefined) {
			if (mousePos.lineNumber < this._boxRange[0] || mousePos.lineNumber > this._boxRange[1]) {
				this.disposeExplanations();
			}
		}
	}

	private showMultiExplainer() {
		if (this.borderDiv !== undefined) {
			this.borderDiv.style.opacity = "1";
		}
		if (this.box !== undefined) {
			this.box.style.opacity = "1";
		}
		if (this.borderDiv0 !== undefined) {
			this.borderDiv0.style.opacity = "1";
		}
		if (this.box0 !== undefined) {
			this.box0.style.opacity = "0.7";
			this.box0.style.display = "block";
		}
	}

	private hideMultiExplainer() {
		if (this.borderDiv !== undefined) {
			this.borderDiv.style.opacity = "0";
		}
		if (this.box !== undefined) {
			this.box.style.opacity = "0";
		}
		if (this.borderDiv0 !== undefined) {
			this.borderDiv0.style.opacity = "0";
		}
	}

	private onMouseMove(mouseEvent: IEditorMouseEvent) {
		if (mouseEvent.target === null) {
			return;
		}
		if (this._allModeFlag == false) {
			if (this.box2 === undefined || this._boxRange === undefined) {
				return;
			}
			if (this.contentDivMulti === undefined || this.borderDivMulti === undefined) {
				return;
			}

			var target = mouseEvent.target.element;
			if (target?.className == "MultiSingleExplainer" || target?.className == "bendSingle") {
				this.box2.style.display = "block";
				return;
			}

		} else {
			if (this.box1 === undefined) {
				return;
			}
			if (this.contentDivAll === undefined || this.borderDivAll === undefined) {
				return;
			}
			var target = mouseEvent.target.element;
			if (target?.className == "MultiSingleExplainer" || target?.className == "bend") {
				this.box1.style.display = "block";
				return;
			}
			if (this._boxRange === undefined) {
				this._boxRange = [1, this._editor.getValue().split("\n").length];
			}
		}
		//var visableStart = this._editor.getVisibleRanges()[0].startLineNumber;

		var PosY = mouseEvent.event.posy;
		var currentToTop = this._editor.getScrollTop();
		var realLineNum = Math.ceil((currentToTop + PosY - 85) / this.lineHeight);
		if (realLineNum < 1) {
			return;
		}
		var PosX = mouseEvent.event.posx - 66 - 48;
		var allText = this._editor.getValue() + this._lastGeneratedCode;
		var temps = allText.replace(/\\n/g, '\n');
		var currentLineText = temps.split("\n")[realLineNum - 1];

		if (!(currentLineText == undefined)) {
			var currentSpaces = currentLineText.length - currentLineText.trim().length;
			if (PosX <= currentSpaces * this._codeTextRatio
				|| currentLineText.length * this._codeTextRatio <= PosX) {
				if (this._allModeFlag && this.box1 !== undefined) {
					this.box1.style.display = "none";
				} else if (this.box2 !== undefined) {
					this.box2.style.display = "none";
				}
				this.showMultiExplainer();
				this.recordGeneratedCode();
				return;
			}
		}

		if (realLineNum < this._boxRange[0] || realLineNum > this._boxRange[1]) {
			if (this._allModeFlag && this.box1 !== undefined) {
				this.box1.style.display = "none";
			} else if (this.box2 !== undefined) {
				this.box2.style.display = "none";
			}

			var allBends = document.getElementsByClassName("bend");
			for (var i = 0; i < allBends.length; i++) {
				var bend = allBends[i] as HTMLElement;
				bend.style.opacity = "1";
			}
			this.showMultiExplainer();
			this.recordGeneratedCode();
			return;
		} else if (this._lastHoveredBend !== realLineNum || document.getElementById("placeholderMulti") !== null) {
			this._lastHoveredBend = realLineNum;
			if (this._allModeFlag && this.box1 !== undefined && this.contentDivAll !== undefined) {
				this.createSingleInMultiExplainer();
				this.box1.style.display = "block";
				this.box1.style.top = realLineNum * this.lineHeight + 2 - currentToTop + 'px';
				this.contentDivAll.style.opacity = "1";
				this._box1OriginalPostion = realLineNum * this.lineHeight + 2;
				var lineNb = String(realLineNum);
				if (this._allExplain && lineNb in this._allExplain) {
					var explainArr = this._allExplain[lineNb];
					if (explainArr !== undefined) {
						this.createSingleExplainer(explainArr, realLineNum, this.contentDivAll, this.borderDivAll);
					}
				}
				this.box1.style.display = "block";
			} else if (this.box2 !== undefined && this.contentDivMulti !== undefined) {
				this.createSingleInMultiExplainer();
				this.box2.style.display = "block";
				this.box2.style.top = realLineNum * this.lineHeight + 2 - currentToTop + 'px';
				this.contentDivMulti.style.opacity = "1";
				this._box2OriginalPostion = realLineNum * this.lineHeight + 2;
				var lineNb = String(realLineNum);
				if (this._multiSingleExplain && lineNb in this._multiSingleExplain) {
					var explainArr = this._multiSingleExplain[lineNb];
					if (explainArr !== undefined) {
						this.createSingleExplainer(explainArr, realLineNum, this.contentDivMulti, this.borderDivMulti);
					}
				}
				this.box2.style.display = "block";
			}
			var allBends = document.getElementsByClassName("bend");
			for (var i = 0; i < allBends.length; i++) {
				var bend = allBends[i] as HTMLElement;
				bend.style.opacity = "1";
			}
			this.hideMultiExplainer();
			this.recordGeneratedCode();
		} else {
			if (this._allModeFlag && this.box1 !== undefined) {
				this.box1.style.display = "block";
			} else if (this.box2 !== undefined) {
				this.box2.style.display = "block";
			}
		}
	}

	private onDidScrollChange() {
		if (this.box) {
			this.box.style.top = this._boxOriginalPostion - this._editor.getScrollTop() + "px";
		}
		if (this.box0) {
			this.box0.style.top = this._box0OriginalPostion - this._editor.getScrollTop() + "px";
		}
		if (this.box2) {
			this.box2.style.top = this._box2OriginalPostion - this._editor.getScrollTop() + "px";
			this.box2.style.left = 66 - this._editor.getScrollLeft() + "px";
		}
		if (this.box1) {
			this.box1.style.top = this._box1OriginalPostion - this._editor.getScrollTop() + "px";
			this.box1.style.left = 66 - this._editor.getScrollLeft() + "px";
		}
		if (this.box?.classList.contains("single")) {
			this.box.style.left = 66 - this._editor.getScrollLeft() + "px";
		}
		if (this.box0?.classList.contains("single")) {
			this.box0.style.left = this._box0OriginalPostion - this._editor.getScrollTop() + "px";
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
			}
		};
		if (multiLineStreamFlag == false || type == "single") {
			var summaryArr = await OpenaiFetchAPI(text, type);
			return summaryArr;
		}
	}

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
		this._allModeFlag = false;
		this.disposeAllExplainer();
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
		var currentIdx = this.createExplainer(generatedCode, explainType, mousePos.lineNumber, generatedCodeLength);
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
			this.createSingleInMultiExplainer();
			var numberSections = 3,
				realCode = 0;
			var splitLines = generatedCode.split("\n");
			for (var i = 0; i < splitLines.length; i++) {
				let lineNb = String(mousePos.lineNumber + i);
				if (isComment(splitLines[i]) == false) {
					realCode += 1;
					let summaryArrEach = OpenaiFetchAPI(splitLines[i], "single");
					summaryArrEach.then((value) => {
						if (value && this._multiSingleExplain) {
							this._multiSingleExplain[lineNb] = value;
						}
					});
				} else {
					this._multiSingleExplain[lineNb] = [[0, 0, ""]];
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
		this.disposeExplanations();
	}

	private generateAllExplanations() {
		this.disposeAllExplainer();
		this._allModeFlag = true;
		var allCode = this._editor.getValue();
		this._allExplain = {};
		var numberSections = 3,
			realCode = 0;

		var splitLines = allCode.split("\n");
		this._boxRange = [1, splitLines.length];
		this.createExplainer(allCode, "all", 1, splitLines.length);
		if (this.box0 === undefined) return;
		if (this.contentDiv0 === undefined) return;
		this.parent[0].insertBefore(this.box0, this.parent[0].firstChild);
		this.onDidScrollChange();
		// single line
		this.createSingleInMultiExplainer();
		for (var i = 0; i < splitLines.length; i++) {
			let lineNb = String(i + 1);
			if (isComment(splitLines[i]) == false) {
				realCode += 1;
				let summaryArrEach = OpenaiFetchAPI(splitLines[i], "single");
				summaryArrEach.then((value) => {
					if (value && this._allExplain) {
						this._allExplain[lineNb] = value;
					}
				});
			} else {
				this._allExplain[lineNb] = [[0, 0, ""]];
			}
		}
		// multiple lines
		if (realCode > 12) {
			var numberSections = Math.ceil(realCode / 4);
		} else if (realCode > 4) {
			var numberSections = 3;
		} else {
			var numberSections = 2;
		}
		OpenaiStreamAPI(allCode, this.contentDiv0, numberSections);
		this.recordGeneratedCode();
	}

	private onKeyDown(e: IKeyboardEvent) {
		this.disposeAllExplainer();
		if (this._allModeFlag == false) {
			var mousePos = this._editor.getPosition();
			if (mousePos !== null && this._boxRange !== undefined) {
				if (mousePos.lineNumber < this._boxRange[0] || mousePos.lineNumber > this._boxRange[1]) {
					this.disposeExplanations();
				}
			}
		}

		if (e.keyCode == 49 && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
			this.generateAllExplanations();
		}
	}

	private linkCodeToExplanations(guildLineArr: [number, number, string][]) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		var lastLine = guildLineArr[guildLineArr.length - 1];
		svg.setAttribute('width', `${Math.max(lastLine[0], lastLine[1])}px`);
		svg.setAttribute('height', '15px');
		// Create a new line element
		for (var i = 0; i < guildLineArr.length; i++) {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', `${guildLineArr[i][1]}`);
			line.setAttribute('y1', String(this._guildLineHeight));
			line.setAttribute('x2', `${guildLineArr[i][0]}`);
			line.setAttribute('y2', '0');
			line.style.stroke = guildLineArr[i][2]; // Line color
			line.style.strokeWidth = '2px'; // Line width

			// Add the line to the SVG element
			svg.appendChild(line);
		}

		return svg;
	}

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
			labelTextRatio = 5.5,
			paddingSize = 5;
		// remove all childern inside the borderDiv
		var childern = borderDiv.children;
		for (var i = childern.length - 1; i >= 0; i--) {
			borderDiv.removeChild(childern[i]);
		}
		var codeLineContainer = document.createElement("div");
		codeLineContainer.style.height = '2px';
		borderDiv.appendChild(codeLineContainer);

		var guideLineContainer = document.createElement("div");
		guideLineContainer.style.height = this._guildLineHeight + 'px';
		borderDiv.appendChild(guideLineContainer);

		var nextPos = bends[0][0] * this._codeTextRatio;
		var guildLineArr: [number, number, string][] = [];
		var guideLineFlag = false;
		var numberInLabel = Math.ceil((bendWidth - paddingSize * 2) / labelTextRatio);
		for (var i = 0; i < bends.length; i++) {

			var newBend = document.createElement("div"),
				codeLine = document.createElement("div");
			newBend.className = 'bendSingle';
			newBend.id = 'bend_' + currentIdx + "_" + i;

			codeLine.className = 'codeLine';
			codeLine.id = 'codeLine' + i;
			codeLine.style.width = (bends[i][1] - bends[i][0] + 1) * this._codeTextRatio + 'px';
			codeLine.style.marginLeft = (bends[i][0] - lastIdx - 1) * this._codeTextRatio + 'px';
			codeLine.style.height = '1px';
			codeLine.style.float = 'left';
			codeLine.style.display = 'inline-block';
			codeLine.style.borderTop = '2px solid ' + colorHue[i % colorHue.length];
			codeLine.style.boxSizing = 'border-box';

			var upperMid = (bends[i][1] + bends[i][0] + 1) * this._codeTextRatio / 2;

			newBend.style.backgroundColor = 'rgb(37, 40, 57, 1)'; //132,194,214,0.2
			newBend.style.borderTop = '2px solid ' + colorHue[i % colorHue.length];
			newBend.style.boxSizing = 'border-box';
			newBend.style.boxShadow = "0px 10px 10px 5px rgba(0, 0, 0, 0.3)";
			newBend.innerText = bends[i][2];
			newBend.style.fontSize = '10px';
			newBend.style.float = 'left';

			if (numberInLabel > bends[i][2].length) {
				var labelWidth = bends[i][2].length * labelTextRatio + 10;
			} else {
				var labelWidth = bendWidth;
			}
			newBend.style.width = labelWidth + 'px';

			var diffPos = bends[i][0] * this._codeTextRatio - nextPos;
			if (diffPos >= 0) {
				if (i == 0) {
					newBend.style.marginLeft = bends[i][0] * this._codeTextRatio + 'px';
				} else {
					newBend.style.marginLeft = diffPos + 'px';
				}
				nextPos = bends[i][0] * this._codeTextRatio + labelWidth;
				var lowerMid = bends[i][0] * this._codeTextRatio + labelWidth / 2;
			} else {
				newBend.style.marginLeft = '3px';
				var lowerMid = nextPos + labelWidth / 2;
				nextPos = nextPos + 3 + labelWidth;
				guideLineFlag = true;
			}

			if (bends[i][0] == bends[i][1] && bends[i][2] == "") {
				codeLine.style.display = 'none';
				newBend.style.display = 'none';
			} else {
				newBend.style.display = 'inline-block';
			}
			newBend.style.whiteSpace = 'pre-wrap';
			newBend.style.paddingLeft = paddingSize + 'px';
			newBend.style.paddingRight = paddingSize + 'px';

			contentDiv?.appendChild(newBend);
			codeLineContainer.appendChild(codeLine);

			heighArry.push(newBend.offsetHeight);
			lastIdx = bends[i][1];
			var newGuildLine: [number, number, string] = [upperMid, lowerMid, colorHue[i % colorHue.length]];
			guildLineArr.push(newGuildLine);
		}
		if (guideLineFlag) {
			var svg = this.linkCodeToExplanations(guildLineArr);
			guideLineContainer.appendChild(svg);
			borderDiv.style.height = 2 + this._guildLineHeight + 'px';
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

	private createSingleInMultiExplainer() {
		if (this._allModeFlag) {
			this.box1?.remove();
			this.box1 = undefined;
			this.contentDivAll?.remove();
			this.contentDivAll = undefined;
			this.borderDivAll?.remove();
			this.borderDivAll = undefined;

			this.box1 = document.createElement('div');
			this.box1.id = "single_container_in_multi";
			this.box1.className = "MultiSingleExplainer";
			this.box1.style.position = 'absolute';
			this.box1.style.backgroundColor = 'rgb(37, 40, 57, 0.2)';
			this.box1.style.top = 1500 + 'px';
			this.box1.style.left = '66px';
			this.box1.style.width = '1500px';
			this.box1.style.height = '100px';
			this.box1.style.display = "none";
			this.box1.style.zIndex = '110';

			this.borderDivAll = document.createElement('div');
			this.borderDivAll.id = "borderDivMulti";
			this.borderDivAll.className = "MultiSingleExplainer";
			//this.borderDivAll.style.width = '1500px';
			this.borderDivAll.style.height = '3px';
			this.borderDivAll.style.backgroundColor = 'rgb(37, 40, 57, 0.8)';
			this.box1.appendChild(this.borderDivAll);

			this.contentDivAll = document.createElement('div');
			this.contentDivAll.id = "contentDivMulti";
			this.contentDivAll.className = "MultiSingleExplainer";
			this.contentDivAll.style.backgroundColor = 'rgba(37, 40, 57, 0.2)'; //60, 60, 60, 1
			this.contentDivAll.style.boxSizing = 'border-box';
			this.contentDivAll.style.display = 'block';
			//this.contentDivAll.style.width = '1500px';

			var placeholder = document.createElement('div');
			placeholder.id = "placeholderMulti";
			placeholder.textContent = '...';
			placeholder.style.paddingLeft = '5px';
			placeholder.style.marginTop = '2px';
			placeholder.style.borderLeft = '1.5px solid white';
			this.contentDivAll.appendChild(placeholder);
			animateDots(placeholder);

			this.box1.appendChild(this.contentDivAll);
			this.parent[0].insertBefore(this.box1, this.parent[0].firstChild);
		} else {
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
			//this.borderDivMulti.style.width = '1500px';
			this.borderDivMulti.style.height = '3px';
			this.borderDivMulti.style.backgroundColor = 'rgb(37, 40, 57, 0.8)';
			this.box2.appendChild(this.borderDivMulti);

			this.contentDivMulti = document.createElement('div');
			this.contentDivMulti.id = "contentDivMulti";
			this.contentDivMulti.className = "MultiSingleExplainer";
			this.contentDivMulti.style.backgroundColor = 'rgba(37, 40, 57, 0.2)'; //60, 60, 60, 1
			this.contentDivMulti.style.boxSizing = 'border-box';
			this.contentDivMulti.style.display = 'block';
			//this.contentDivMulti.style.width = '1500px';

			var placeholder = document.createElement('div');
			placeholder.id = "placeholderMulti";
			placeholder.textContent = '...';
			placeholder.style.paddingLeft = '5px';
			placeholder.style.marginTop = '2px';
			placeholder.style.borderLeft = '1.5px solid white';
			this.contentDivMulti.appendChild(placeholder);
			animateDots(placeholder);

			this.box2.appendChild(this.contentDivMulti);
			this.parent[0].insertBefore(this.box2, this.parent[0].firstChild);
		}

		// parent.insertBefore(containerDiv, parent.firstChild);
	}

	private createExplainer(diff: string, type: string, startLine: number, generatedCodeLength: number = 0) {
		var newIdx = this._explainerIdx;
		var eachLine = diff.split("\n");

		if (this.editorDiv === null) {
			throw new Error('Cannot find Monaco Editor');
		}

		var generateLine = generatedCodeLength;
		if (type == "all") {
			this.box0 = document.createElement('div');
			this.box0.style.position = 'absolute';
			this.box0.className = "containerAll";
			this.box0.style.zIndex = '100';
			this.box0.id = "explainerAll";
			this.borderDiv0 = document.createElement('div');
			this.borderDiv0.id = "borderDivAll" + newIdx;

			this.contentDiv0 = document.createElement('div');
			this.contentDiv0.id = "contentDivAll" + newIdx;
			this.contentDiv0.style.backgroundColor = 'rgba(37, 40, 57, 0.2)'; //60, 60, 60, 1
			this.contentDiv0.style.boxSizing = 'border-box';
			this.contentDiv0.style.display = 'block';

			var explainStart = getStartPos(eachLine, "wide");
			var trueVisableEditor = this.parent[0].parentElement;
			var editorWidth = Number(trueVisableEditor?.style.width.replace("px", ""));
			var explainWidth = editorWidth - explainStart;
			this._box0OriginalPostion = (startLine - 1) * this.lineHeight;
			this.box0.style.top = this._box0OriginalPostion + 'px';
			this.box0.style.left = explainStart + 'px';
			this.box0.style.height = generateLine * this.lineHeight + 'px';
			this.borderDiv0.style.height = generateLine * this.lineHeight + 'px';
			this.borderDiv0.style.float = 'left';
			this.borderDiv0.style.width = '30px';
			this.borderDiv0.style.backgroundImage = 'linear-gradient(to right, rgba(37, 40, 57, 0), rgba(37, 40, 57, 1) 100%)';//60, 60, 60
			this.contentDiv0.style.height = generateLine * this.lineHeight + 'px';
			this.contentDiv0.style.width = explainWidth - 30 + 'px';
			this.contentDiv0.style.float = 'right';
			this.box0.appendChild(this.borderDiv0);
			this.box0.appendChild(this.contentDiv0);
			this.box0.style.opacity = "0.7";
		} else {
			this.disposeExplanations();
			this._boxRange = [startLine, startLine + generatedCodeLength - 1];
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
			this.box.appendChild(this.contentDiv);
		}
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

	public disposeAllExplainer() {
		if (document.getElementById("explainer_container") !== null) {
			return;
		} else {
			if (this.box0) {
				this.box0.remove();
				this.box0 = undefined;
			}
			if (this.borderDiv0) {
				this.borderDiv0.remove();
				this.borderDiv0 = undefined;
			}
			if (this.contentDiv0) {
				this.contentDiv0.remove();
				this.contentDiv0 = undefined;
			}
			if (this.box1) {
				this.box1.remove();
				this.box1 = undefined;
			}
			if (this.borderDivAll) {
				this.borderDivAll.remove();
				this.borderDivAll = undefined;
			}
			if (this.contentDivAll) {
				this.contentDivAll.remove();
				this.contentDivAll = undefined;
			}
		}
	}
}

var idOfExplainer = 0;

export function addExplainer(editor: ICodeEditor) {
	var explainer = new Explainer(editor);
	registerEditorContribution(String(idOfExplainer), explainer, EditorContributionInstantiation.BeforeFirstInteraction);
	idOfExplainer += 1;
}
