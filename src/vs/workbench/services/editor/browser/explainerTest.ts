import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';

export function addExplainer() {
	console.log("added explainer");
}

function diffText(textA: string, textB: string) {
	var diff = "";
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
		}
	}
	return diff;
}

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	constructor(
		private readonly _editor: ICodeEditor,
		private _box: HTMLDivElement,
		private _posttext: string,
		private _pretext: string
	) {
		this._editor.onKeyDown((e) => { this.onKeyDown(e); });
		this._editor.onKeyUp((e) => { this.onKeyUp(e); });
		this._editor.onDidDispose(() => { this.dispose(); });
	}

	private onKeyDown(e: IKeyboardEvent) {
		this._pretext = this._editor.getValue();
	}

	private onKeyUp(e: IKeyboardEvent) {
		this._posttext = this._editor.getValue();
		var diffed = diffText(this._posttext, this._pretext);
		console.log(diffed);
		if (diffed.split("\n").length > 3) {
			const editor_div = this._editor.getDomNode();
			if (editor_div === null) {
				throw new Error('Cannot find Monaco Editor');
			}
			if (document.getElementById("explainer_container") !== null) {
				return;
			}
			this._box = document.createElement('div');
			this._box.style.position = 'absolute';
			this._box.style.top = '0px'; // offset from the run button + border + padding
			this._box.style.bottom = '14px'; // offset from the horizontal scroll bar (if any)
			this._box.style.right = '200px';
			this._box.style.height = 'auto';
			this._box.style.width = '500px';
			this._box.style.backgroundColor = 'rgba(10, 10, 10, 0.2)';
			this._box.innerText = 'Hello World';
			this._box.id = "explainer_container";
			this._box.style.zIndex = '100';
			var parent = editor_div.getElementsByClassName("lines-content monaco-editor-background")
			parent[0].appendChild(this._box);
			console.log(parent);
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
