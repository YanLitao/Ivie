import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';

export function addExplainer() {
	console.log("added explainer");
}

export class Explainer {
	public static readonly ID = 'editor.contrib.explainer';
	constructor(
		private readonly _editor: ICodeEditor,
		private _box: HTMLDivElement,
		//private _posttext: string,
		private _pretext: string
	) {
		this._editor.onKeyDown((e) => { this.onKeyDown(e); });
		this._editor.onKeyUp((e) => { this.onKeyUp(e); });
		this._editor.onDidDispose(() => { this.dispose(); });
	}

	private onKeyDown(e: IKeyboardEvent) {
		console.log(this._editor);
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
		editor_div.appendChild(this._box);
		//editor_div.getElementsByClassName("lines-content monaco-editor-background")
	}

	private onKeyUp(e: IKeyboardEvent) {
		var model = this._editor.getModel();
		if (model === null) {
			throw new Error('Cannot find Monaco Editor');
		}
		var sel = this._editor.getSelection();
		if (sel === null) {
			throw new Error('Cannot find Monaco Editor');
		}
		this._pretext = model.getValueInRange(sel);
		console.log(this._pretext);
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
