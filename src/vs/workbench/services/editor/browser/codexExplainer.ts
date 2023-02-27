function createBendDiv(height: number, marginTop: number, text: string) {
	var newBend = document.createElement('div');
	newBend.className = 'bend';
	newBend.style.height = String(height) + 'px';
	newBend.style.lineHeight = String(height) + 'px';
	newBend.style.marginTop = String(marginTop) + 'px';
	newBend.style.backgroundColor = 'rgb(132,194,214,0.2)';
	newBend.style.borderLeft = '2px solid white';
	newBend.style.boxSizing = 'border-box';
	newBend.innerText = text;
	return newBend;
}

export function drawBends(div: HTMLDivElement, bends: [number, number, string][], lineHeight: number) {
	var whiteSpace = 2;
	for (var i = 0; i < bends.length; i++) {
		var heigh = (bends[i][1] - bends[i][0] + 1) * lineHeight - whiteSpace;
		if (i == 0) {
			// first bend
			var marginTop = (bends[0][0] - 1) * lineHeight;
		} else {
			var marginTop = (bends[i][0] - bends[i - 1][1] - 1) * lineHeight + whiteSpace;
		}
		var text = bends[i][2];
		var newBend = createBendDiv(heigh, marginTop, text);
		console.log(newBend);
		div.appendChild(newBend);
	}
}

export function matchText(shortText: string, longText: string, startIdx: number) {
	shortText = shortText.trim();
	const lines = longText.split('\n');
	let startLine = -1;
	let endLine = -1;
	for (let i = startIdx; i < lines.length; i++) {
		const line = lines[i];
		if (line.includes(shortText)) {
			startLine = i + 1;
			endLine = i + 1;
			break;
		}
	}
	//console.log(shortText, startLine, endLine);
	return {
		startLine,
		endLine
	}
}

export function matchLongText(text: string, longText: string) {
	text = text.trim();
	var textSplit = text.split("\n");
	const lines = longText.split('\n');
	let startLine = -1;
	let endLine = -1;
	let indexStart = 0;
	for (const t of textSplit) {
		if (t.trim() == "") { continue };
		let innerStart = -1;
		let innerEnd = -1;
		let flag = false;
		for (let i = indexStart; i < lines.length; i++) {
			if (lines[i].includes(t.trim())) {
				innerStart = i + 1;
				innerEnd = i + 1;
				flag = true;
				break;
			}
		}
		if (flag) {
			if (innerStart != -1 && (innerStart < startLine || startLine == -1)) {
				startLine = innerStart;
			}
			if (innerEnd != -1 && innerEnd > endLine) {
				endLine = innerEnd;
			}
			if (endLine > lines.length) {
				return;
			} else if (endLine != -1) {
				indexStart = endLine;
			}
		}
	}
	return {
		startLine,
		endLine
	}
}

/* onTestChange = function() {
	var key = window.event.keyCode;
	if (key == 13) {
		var prompt = document.getElementById("codeBlock").value.split("\n")[0],
			numberSections = document.getElementById("summarySlide").value;
			OpenaiFetchAPI(prompt, numberSections);
	}
} */


export async function OpenaiFetchAPI(code: string, numberSections: number, lineHeight: number, div: HTMLDivElement) {
	var url = "https://api.openai.com/v1/completions";
	var bearer = 'Bearer ' + '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'
	var prompt = "Split the below code into " + numberSections + " snippets, printing out each snippet, and explaining each snippet (start with *).\n" +
		"Prompt:\n" +
		"var beginDate = new Date(begin);\n" +
		"var endDate = new Date(end);\n" +
		"var days = Math.round((endDate - beginDate) / (1000 * 60 * 60 * 24));\n" +
		"Output:\n" +
		"*1. Define the start date.\n" +
		"var beginDate = new Date(begin);\n" +
		"*2. Define the end date.\n" +
		"var endDate = new Date(end);\n" +
		"*3. Calculate the number of days between the start and end dates.\n" +
		"var days = Math.round((endDate - beginDate) / (1000 * 60 * 60 * 24));\n" +
		"Prompt: \n";
	var promptSummary = prompt + code + "\nOutput:";
	console.log(promptSummary);
	let returnSum = await fetch(url, {
		method: 'POST',
		headers: {
			'Authorization': bearer,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			"model": "text-davinci-003",//davinci:ft-personal-2023-02-12-20-22-59
			"prompt": promptSummary,
			"max_tokens": 1000,
			"temperature": 0.5,
			"top_p": 0.5,
			"n": 1,
			"stream": false,
			"logprobs": null
		})
	}).then(response => {
		return response.json()
	}).then(data => {
		var explainArr = data['choices'][0].text.split("\n*"),
			summaryArr: [number, number, string][] = [],
			lastLine = 0;
		console.log(explainArr);
		var codeLine = code.split("\n").length;
		var regExp = /[a-zA-Z]/g;
		for (const e of explainArr) {
			var eArr = e.split("\n");
			if (eArr.length >= 2) {
				var newExplain: [number, number, string] = [lastLine + 1, lastLine + 1, eArr.shift()];
				for (var i = 0; i < eArr.length; i++) {
					if (regExp.test(eArr[i])) {
						var otherLineNumbers = matchText(eArr[i], code, lastLine);
						if (i == 0) {
							newExplain[0] = otherLineNumbers.startLine;
						} else if (lastLine < otherLineNumbers.startLine && otherLineNumbers.startLine < newExplain[0]) {
							newExplain[0] = otherLineNumbers.startLine;
						}
						if (otherLineNumbers.endLine > newExplain[1]) {
							newExplain[1] = otherLineNumbers.endLine;
						}
					}
				}
				lastLine = newExplain[1];
				// match the codeText with the code in the #codeBlock div
				// document.getElementById("codeBlock").innerText.match(codeText);
				summaryArr.push(newExplain);
			}
			if (lastLine >= codeLine) {
				break;
			}
		}
		console.log(summaryArr);
		drawBends(div, summaryArr, lineHeight);
	}).catch(error => {
		console.log('Cannot successfully generate the summaries for the code: ' + error)
	});
	return returnSum;
}
