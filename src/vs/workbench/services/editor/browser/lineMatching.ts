function levenshtein(a: string, b: string): number {
	const matrix: number[][] = [];

	// Increment along the first column of each row
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	// Increment each column in the first row
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	// Fill in the rest of the matrix
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

export function blurMatching(stringA: string, longString: string, startLine: number): { startLine: number; endLine: number } {
	var stringA = stringA.replace(/\\n/g, '\n');
	const linesA = stringA.split('\n');
	console.log("linesA: ", linesA);
	const linesLong = longString.split('\n');
	let bestStartLine: number = -1;
	let bestEndLine: number = -1;
	const similarityThreshold = 2; // You can adjust this value
	const endLineFlexibility = 2; // The acceptable range for the end line, relative to the expected end

	// Iterate through the long string lines starting from the given startLine
	for (let i = startLine; i < linesLong.length - linesA.length; i++) {
		let matchingStreak = 0;
		let currentStartLine: number = -1;

		// Iterate through stringA lines
		for (let j = 0; j < linesA.length; j++) {
			const lineA = linesA[j].trim();
			const lineLong = linesLong[i + j] ? linesLong[i + j].trim() : null;

			// Check if lines match using the Levenshtein distance
			if (lineLong !== null && levenshtein(lineA, lineLong) <= similarityThreshold) {
				if (currentStartLine === -1) currentStartLine = i + j;
				matchingStreak++;
			}
		}

		// Check if the matching streak is within acceptable range
		if (matchingStreak >= linesA.length - endLineFlexibility) {
			bestStartLine = currentStartLine!;
			bestEndLine = bestStartLine + linesA.length - 1;
			break;
		}
	}

	// If no match is found, return the startLine and the calculated end line
	if (bestStartLine === -1) {
		bestStartLine = startLine;
		bestEndLine = startLine + linesA.length - 1;
	}
	console.log("bestStartLine: " + bestStartLine + ", bestEndLine: " + bestEndLine);
	return { "startLine": bestStartLine, "endLine": bestEndLine };
}


