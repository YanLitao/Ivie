import OpenAI from 'openai';

// Use process.env to access environment variables
const apiKey = process.env.OPENAI_TOKEN;

// Check if apiKey is not defined and throw an error
if (!apiKey) {
	throw new Error("Please set the OPENAI_KEY environment variable.");
}

const openai = new OpenAI({
	apiKey: apiKey,
	dangerouslyAllowBrowser: true
});


function createBendDiv(height: number, marginTop: number, text: string, contentWidth: number) {
	var newBend = document.createElement('div');
	newBend.className = 'bend';
	newBend.style.height = String(height) + 'px';
	//newBend.style.lineHeight = String(height) + 'px';
	//newBend.style.display = 'block';
	newBend.style.width = String(contentWidth) + 'px';
	newBend.style.verticalAlign = 'middle';
	newBend.style.marginTop = String(marginTop) + 'px';
	//newBend.style.marginBottom = String(marginTop) + 'px';
	newBend.style.backgroundColor = '#FCFCFC'; //132,194,214,0.2
	newBend.style.borderLeft = '1.5px solid #676FA3';
	newBend.style.boxSizing = 'border-box';
	newBend.style.paddingLeft = '5px';
	newBend.style.paddingRight = '5px';
	newBend.style.color = 'black';
	newBend.style.fontWeight = '300';
	newBend.style.fontSize = '14px';
	newBend.style.fontFamily = 'Lato';
	newBend.innerText = text;
	if (height < 20) {
		newBend.style.whiteSpace = 'nowrap';
		newBend.style.overflow = 'hidden';
		newBend.style.textOverflow = 'ellipsis';
	}
	newBend.setAttribute('title', text);
	return newBend;
}

export function drawBends(currentIdx: number, bends: [number, number, string][], lineHeight: number, type: string, contentWidth: number) {
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
			var newBend = createBendDiv(height, marginTop, text, contentWidth);
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
			newBend.style.backgroundColor = '#FCFCFC'; //132,194,214,0.2
			newBend.style.borderTop = '2px solid white';
			newBend.style.boxSizing = 'border-box';
			newBend.innerText = bends[i][2];
			newBend.style.fontSize = '18px';
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

export async function OpenaiFetchAPI(code: string, explainType: string, targetCode: number = 0) {
	if (explainType == "multi") {
		var splitCode = code.split("\n");
		var prompt = "Please split the line of code I want explained, and explain any " +
			"variables, parameters, functions, and structures inside it " +
			"with less than 10 words.\n" +

			"Prompt:\n" +
			'"""\n' +
			"# Lines before the code of interest\n" +
			"from flask import Flask, render_template, request, jsonify, send_from_directory\n" +
			"import os\n" +
			"# The line I want explained\n" +
			"app = Flask(__name__, template_folder='web',static_folder='static')\n" +
			"# Lines after the code of interest\n" +
			"@app.route('/')\n" +
			"def index():\n" +
			"	return render_template('authoring.html')\n" +
			'"""\n' +

			"Output:\n" +
			"app = Flask $#$Create a Flask application.\n" +
			"__name__ $#$The name of the current module.\n" +
			"template_folder='web' $#$Set the folder for templates.\n" +
			"static_folder='static' $#$Set the folder for static files.\n" +
			"Prompt:\n";

		var preCode = splitCode.slice(0, targetCode).join("\n");
		var explainCode = splitCode.slice(targetCode, targetCode + 1).join("\n");
		var postCode = splitCode.slice(targetCode + 1, splitCode.length).join("\n");
		var promptSummary = prompt + '"""\n' +
			"# Lines before the code of interest\n" +
			preCode + "\n" +
			"# The line I want explained\n" +
			explainCode + "\n" +
			"# Lines after the code of interest\n" +
			postCode + "\n" +
			'"""\n' +
			"\nOutput:";
	} else {
		var prompt = "Please dissect the following line of code, and explain the unfamiliar vocabulary and structures with " +
			"less than 15 words each. Include constraints for parameter values and describe how changes in these parameters will affect the output.\n" +
			"Prompt:\n" +
			"fig, ax = plt.subplots(2, 1, figsize=(14, 10))\n" +
			"Output:\n" +
			"plt.subplots $#$ Create a figure and set of subplots.\n" +
			"2, 1 $#$ 2 rows, 1 column of subplots.\n" +
			"figsize=(14, 10) $#$ Width and height of entire figure.\n" +
			"Prompt:\n";
		var promptSummary = prompt + code.trim() + "\nOutput:";
	}
	const chatCompletion = await openai.chat.completions.create({
		messages: [{ role: 'user', content: promptSummary }],
		model: 'gpt-4-1106-preview',
	}).then(response => {
		var data = response.choices[0].message.content;
		if (!data) {
			return "";
		} else {
			return data;
		}

		// }).catch(error => {
		// 	console.log('Cannot successfully generate the summaries for the code: ' + error)
		// });
		// let returnSum = await fetch(url, {
		// 	method: 'POST',
		// 	headers: {
		// 		'Authorization': bearer,
		// 		'Content-Type': 'application/json'
		// 	},
		// 	body: JSON.stringify({
		// 		"model": "text-davinci-003",//davinci:ft-personal-2023-02-12-20-22-59
		// 		"prompt": promptSummary,
		// 		"max_tokens": 1000,
		// 		"temperature": 0.5,
		// 		"top_p": 0.5,
		// 		"n": 1,
		// 		"stream": false,
		// 		"logprobs": null
		// 	})
		// }).then(response => {
		// 	return response.json()
	}).then(data => {
		var summaryArr: [number, number, string][] = [],
			lastLine = 0;
		var explainArr = data.split("\n");
		var entireLine = code;
		var rangeStart = entireLine.indexOf(code);
		var rangeEnd = rangeStart + code.length;
		if (explainType == "multi") {
			var entireLine = explainCode;
			var rangeStart = 0;
			var rangeEnd = rangeStart + explainCode.length;
		}
		for (const e of explainArr) {
			if (e.trim() == "") { continue; }
			var e_splited = e.split("$#$");
			var newExplain: [number, number, string] = [lastLine + 1, lastLine + 1, e_splited[1]];
			var text = e_splited[0].trim();
			if (text[0] == "'" || text[0] == '"') {
				text = text.slice(1);
			}
			if (text[text.length - 1] == "'" || text[text.length - 1] == '"') {
				text = text.slice(0, text.length - 1);
			}
			var longText = entireLine.replace(/\t/g, '    ');
			newExplain[0] = lastLine + longText.slice(lastLine).indexOf(text);
			if (newExplain[0] <= newExplain[1]) {
				continue;
			}
			newExplain[1] = newExplain[0] + text.length - 1;
			if ((newExplain[0] < rangeStart && newExplain[1] < rangeStart) || (newExplain[0] >= rangeEnd)) {
				continue;
			}
			lastLine = newExplain[1];
			summaryArr.push(newExplain);
		}
		return summaryArr;
		//drawBends(div, summaryArr, lineHeight);
	}).catch(error => {
		console.log('Cannot successfully generate the summaries for the code: ' + code.trim() + "\nHere is the error message: " + error)
	});
	return chatCompletion;
}

export function animateDots(placeholder: HTMLDivElement) {
	let dots = '...';
	setInterval(() => {
		dots = dots.length < 3 ? dots + '.' : '.';
		placeholder.textContent = "Retrieving explanations" + dots;
	}, 300);
}

function buildBendWithStream(div: HTMLDivElement, e: string, code: string, lastExplain: [number, number, string], placeholder: HTMLDivElement) {
	e = e.replace(/\\n/g, '\n');
	var eArr: string[] = e.split("$$"),
		lastLine = lastExplain[1],
		regExp = /[a-zA-Z]/g;
	if (eArr.length >= 2) {
		var newExplain: [number, number, string] = [lastLine + 1, lastLine + 1, ""];
		var firstLine = eArr.shift();
		var codePart = eArr.join("\n");
		eArr = codePart.split("\n");
		if (firstLine !== undefined && codePart.trim() !== "") {
			newExplain[2] = firstLine.replace(/\\n/g, '');
		} else {
			return;
		}
		for (var i = 0; i < eArr.length; i++) {
			if (regExp.test(eArr[i])) {
				var cleaned = eArr[i].trim().replace(/^```|```$/g, '').trim();
				var otherLineNumbers = matchText(cleaned, code, lastLine);
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
			newExplain[0] = lastExplain[1] + 1;
			newExplain[1] = lastExplain[1] + eArr.length;
			//return;
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
		var newBend = createBendDiv(height, marginTop, text, div.offsetWidth);
		div.insertBefore(newBend, placeholder);
		return newExplain;
	} else {
		return;
	}
}

export async function OpenaiStreamAPI(code: string, div: HTMLDivElement, numberSections: number = 3) {
	var prompt = "Split the below code into several snippets at high level, printing out each snippet, " +
		"and explaining each snippet (start with $* for the explanation and $$ for the code snippet). " +
		"Do not exceed 10 lines of code per snippet. " +
		"Do not explain each line in detail or each parameter. " +
		"Keep the explanation in high level\n" +
		"Prompt:\n" +
		"var beginDate = new Date(begin);\n" +
		"var endDate = new Date(end);\n" +
		"var days = Math.round((endDate - beginDate) / (1000 * 60 * 60 * 24));\n" +
		"Output:\n" +
		"$*1. Define the start and date.\n" +
		"$$var beginDate = new Date(begin);\n" +
		"var endDate = new Date(end);\n" +
		"$*2. Calculate the number of days between the start and end dates.\n" +
		"$$var days = Math.round((endDate - beginDate) / (1000 * 60 * 60 * 24));\n" +
		"Prompt: \n";
	var promptSummary = prompt + code + "\nOutput:";
	const chatCompletion = await openai.chat.completions.create({
		messages: [{ role: 'user', content: promptSummary }],
		model: 'gpt-4-1106-preview',
		stream: true,
	});

	var eachSnippet = "",
		lastChar = "",
		lastExplain: [number, number, string] = [0, 0, ""];
	var placeholder = document.createElement('div');
	placeholder.textContent = '...';
	placeholder.style.paddingLeft = '5px';
	placeholder.style.marginTop = '2px';
	placeholder.style.borderLeft = '1.5px solid white';
	div.appendChild(placeholder);
	animateDots(placeholder);
	for await (const chunk of chatCompletion) {
		if (chunk == null) continue;
		var value = chunk.choices[0].delta.content;
		var done = chunk.choices[0].finish_reason;
		if (done == "stop") {
			if (eachSnippet != "") {
				buildBendWithStream(div, eachSnippet, code, lastExplain, placeholder);
			}
			placeholder.remove();
			break;
		}
		if (value == null) continue;
		if (lastChar.trim() == "$" && value.trim() == "*" || value.trim() == "$*") {
			var temp = buildBendWithStream(div, eachSnippet.slice(0, -1), code, lastExplain, placeholder);
			if (temp != undefined) {
				lastExplain = temp;
			}
			eachSnippet = "";
		} else {
			eachSnippet += value;
		}
		lastChar = value;
	}
}
