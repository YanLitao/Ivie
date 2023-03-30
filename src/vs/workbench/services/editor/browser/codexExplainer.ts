function createBendDiv(height: number, marginTop: number, text: string) {
	var newBend = document.createElement('div');
	newBend.className = 'bend';
	newBend.style.height = String(height) + 'px';
	//newBend.style.lineHeight = String(height) + 'px';
	//newBend.style.display = 'block';
	newBend.style.verticalAlign = 'middle';
	newBend.style.marginTop = String(marginTop) + 'px';
	newBend.style.backgroundColor = 'rgb(30, 30, 30, 1)'; //132,194,214,0.2
	newBend.style.borderLeft = '2px solid white';
	newBend.style.boxSizing = 'border-box';
	newBend.style.paddingLeft = '5px';
	newBend.style.paddingRight = '5px';
	newBend.innerText = text;
	return newBend;
}

export function drawBends(currentIdx: number, bends: [number, number, string][], lineHeight: number, type: string) {
	var div = document.getElementById('contentDiv' + currentIdx);
	if (!div) return;
	var whiteSpace = 2;
	if (type == "multi") {
		for (var i = 0; i < bends.length; i++) {
			var height = (bends[i][1] - bends[i][0] + 1) * lineHeight - whiteSpace;
			if (i == 0) {
				// first bend
				var marginTop = (bends[0][0] - 1) * lineHeight;
			} else {
				var marginTop = (bends[i][0] - bends[i - 1][1] - 1) * lineHeight + whiteSpace;
			}
			var text = bends[i][2];
			var newBend = createBendDiv(height, marginTop, text);
			div.appendChild(newBend);
		}
	} else {
		var lastIndex = -1,
			heighArry = [];
		for (var i = 0; i < bends.length; i++) {
			var newBend = document.createElement('div');
			newBend.className = 'bend';
			newBend.style.width = (bends[i][1] - bends[i][0] + 1) * 7.225 + 'px';
			newBend.style.minHeight = '50px';
			newBend.style.marginLeft = (bends[i][0] - lastIndex - 1) * 7.225 + 'px';
			newBend.style.backgroundColor = 'rgb(40, 44, 52, 1)'; //132,194,214,0.2
			newBend.style.borderTop = '2px solid white';
			newBend.style.boxSizing = 'border-box';
			newBend.innerText = bends[i][2];
			newBend.style.fontSize = '10px';
			newBend.style.float = 'left';
			newBend.style.display = 'inline-block';
			newBend.style.whiteSpace = 'pre-wrap';
			newBend.style.wordWrap = 'break-word';
			newBend.style.paddingLeft = '5px';
			newBend.style.paddingRight = '5px';
			div.appendChild(newBend);
			lastIndex = bends[i][1];
			heighArry.push(newBend.offsetHeight);
		}
		div.style.height = Math.max(...heighArry) + 'px';
		if (div.parentElement) {
			div.parentElement.style.height = Math.max(...heighArry) + 'px';
		}
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
	if (startLine == -1 && endLine > 0) {
		startLine = 1;
	}
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

export async function OpenaiFetchAPI(code: string, explainType: string, currentLine: string = "", numberSections: number = 3) {
	var url = "https://api.openai.com/v1/completions";
	var bearer = 'Bearer ' + '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'
	if (explainType == "multi") {
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
	} else {
		var prompt = "Please split the following line of code and explain the unrecognizable vocabulary and structures inside following line of code with less than 10 words.\n" +
			"Prompt:\n" +
			"tr = pandas.concat(pred.link_df_iter(frames, 0.5))\n" +
			"Output:\n" +
			"tr = pandas.concat #Concatenate DataFrames.\n" +
			"pred.link_df_iter #Iterate over a list of DataFrames.\n" +
			"frames #A list of DataFrames.\n" +
			"0.5 #The threshold for the link score.\n" +
			"Prompt:\n";
		var promptSummary = prompt + (currentLine + code).trim() + "\nOutput:";
	}
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
		var summaryArr: [number, number, string][] = [],
			lastLine = 0;
		if (explainType == "multi") {
			var explainArr = data['choices'][0].text.split("\n*");
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
		} else {
			var explainArr = data['choices'][0].text.split("\n");
			var entireLine = currentLine + code;
			var rangeStart = entireLine.indexOf(code);
			var rangeEnd = rangeStart + code.length;
			for (const e of explainArr) {
				if (e.trim() == "") { continue; }
				var e_splited = e.split("#");
				var newExplain: [number, number, string] = [lastLine + 1, lastLine + 1, e_splited[1]];
				var text = e_splited[0].trim();
				var longText = entireLine.replace(/\t/g, '    ');
				newExplain[0] = longText.indexOf(text);
				newExplain[1] = newExplain[0] + text.length - 1;
				if (newExplain[0] < rangeStart && newExplain[1] < rangeStart || newExplain[0] >= rangeEnd) {
					continue;
				}
				lastLine = newExplain[1];
				summaryArr.push(newExplain);
			}
		}
		console.log(summaryArr);
		return summaryArr;
		//drawBends(div, summaryArr, lineHeight);
	}).catch(error => {
		console.log('Cannot successfully generate the summaries for the code: ' + error)
	});
	return returnSum;
}

function animateDots(placeholder: HTMLDivElement) {
	let dots = '...';
	setInterval(() => {
		dots = dots.length < 3 ? dots + '.' : '.';
		placeholder.textContent = dots;
	}, 500);
}

function buildBendWithStream(div: HTMLDivElement, e: string, code: string, lastExplain: [number, number, string], placeholder: HTMLDivElement) {
	var eArr: string[] = e.split("\n"),
		lastLine = 0,
		regExp = /[a-zA-Z]/g;
	if (eArr.length >= 2) {
		var newExplain: [number, number, string] = [lastLine + 1, lastLine + 1, ""];
		var firstLine = eArr.shift();
		var codePart = eArr.join("\n");
		if (firstLine !== undefined && codePart.trim() !== "") {
			newExplain[2] = firstLine;
		} else {
			return;
		}
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
		if (newExplain[0] == -1) {
			return;
		} else if (newExplain[0] <= lastExplain[1]) {
			return;
		}
		lastLine = newExplain[1];
		var height = (newExplain[1] - newExplain[0] + 1) * 18 - 2;
		if (i == 0) {
			// first bend
			var marginTop = (newExplain[0] - 1) * 18;
		} else {
			var marginTop = (newExplain[0] - lastExplain[1] - 1) * 18 + 2;
		}
		var text = newExplain[2];
		var newBend = createBendDiv(height, marginTop, text);
		div.insertBefore(newBend, placeholder);
		return newExplain;
	} else {
		return;
	}
}

export async function OpenaiStreamAPI(code: string, div: HTMLDivElement, numberSections: number = 3) {
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
			"stream": true,
			"logprobs": null
		})
	});

	const streamReader = returnSum.body?.pipeThrough(new TextDecoderStream()).getReader();
	// read each JSON object from the stream as it is received
	var eachSnippet = "",
		lastChar = "",
		lastExplain: [number, number, string] = [0, 0, ""];
	var placeholder = document.createElement('div');
	placeholder.textContent = '...';
	div.appendChild(placeholder);
	animateDots(placeholder);
	while (true) {
		if (streamReader == null) break;
		var { done, value } = await streamReader.read();
		if (done || value == "[DONE]") {
			if (eachSnippet != "") {
				buildBendWithStream(div, eachSnippet, code, lastExplain, placeholder);
			}
			placeholder.remove();
			break;
		}
		if (value == null) continue;
		var eachData = value?.split('data: ');
		for (const c of eachData) {
			if (c !== "" && c.includes("choices")) {
				try {
					var data = JSON.parse(c);
					var currentChar = data['choices'][0].text;
					if (lastChar == "\n" && currentChar == "*") {
						var temp = buildBendWithStream(div, eachSnippet, code, lastExplain, placeholder);
						if (temp != undefined) {
							lastExplain = temp;
						}
						eachSnippet = "";
					} else {
						eachSnippet += currentChar;
					}
					lastChar = currentChar;
				} catch (e) {
					console.log(e);
				}
			}
		}
	}
}
