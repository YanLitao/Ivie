/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker.importscripts' />
/// <reference lib='dom' />

import * as ts from 'typescript/lib/tsserverlibrary';
import { ApiClient, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection } from '@vscode/sync-api-common/browser';
import { URI } from 'vscode-uri';

// GLOBALS
const watchFiles: Map<string, { path: string; callback: ts.FileWatcherCallback; pollingInterval?: number; options?: ts.WatchOptions }> = new Map();
const watchDirectories: Map<string, { path: string; callback: ts.DirectoryWatcherCallback; recursive?: boolean; options?: ts.WatchOptions }> = new Map();
let session: WorkerSession | undefined;
// END GLOBALS
// BEGIN misc internals
const indent: (str: string) => string = (ts as any).server.indent;
const setSys: (s: ts.System) => void = (ts as any).setSys;
const combinePaths: (path: string, ...paths: (string | undefined)[]) => string = (ts as any).combinePaths;
const byteOrderMarkIndicator = '\uFEFF';
const matchFiles: (
	path: string,
	extensions: readonly string[] | undefined,
	excludes: readonly string[] | undefined,
	includes: readonly string[] | undefined,
	useCaseSensitiveFileNames: boolean,
	currentDirectory: string,
	depth: number | undefined,
	getFileSystemEntries: (path: string) => { files: readonly string[]; directories: readonly string[] },
	realpath: (path: string) => string
) => string[] = (ts as any).matchFiles;
const generateDjb2Hash = (ts as any).generateDjb2Hash;
// End misc internals
// BEGIN webServer/webServer.ts
function fromResource(extensionUri: URI, uri: URI) {
	if (uri.scheme === extensionUri.scheme
		&& uri.authority === extensionUri.authority
		&& uri.path.startsWith(extensionUri.path + '/dist/browser/typescript/lib.')
		&& uri.path.endsWith('.d.ts')) {
		return uri.path;
	}
	return `/${uri.scheme}/${uri.authority}${uri.path}`;
}
function updateWatch(event: 'create' | 'change' | 'delete', uri: URI, extensionUri: URI) {
	const kind = event === 'create' ? ts.FileWatcherEventKind.Created
		: event === 'change' ? ts.FileWatcherEventKind.Changed
			: event === 'delete' ? ts.FileWatcherEventKind.Deleted
				: ts.FileWatcherEventKind.Changed;
	const path = fromResource(extensionUri, uri);
	if (watchFiles.has(path)) {
		watchFiles.get(path)!.callback(path, kind);
		return;
	}
	let found = false;
	for (const watch of Array.from(watchDirectories.keys()).filter(dir => path.startsWith(dir))) {
		watchDirectories.get(watch)!.callback(path);
		found = true;
	}
	if (!found) {
		console.error(`no watcher found for ${path}`);
	}
}

type ServerHostWithImport = ts.server.ServerHost & { importPlugin(root: string, moduleName: string): Promise<ts.server.ModuleImportResult> };

function createServerHost(extensionUri: URI, logger: ts.server.Logger, apiClient: ApiClient | undefined, args: string[], fsWatcher: MessagePort): ServerHostWithImport {
	const currentDirectory = '/';
	const fs = apiClient?.vscode.workspace.fileSystem;
	let watchId = 0;

	// Legacy web
	const memoize: <T>(callback: () => T) => () => T = (ts as any).memoize;
	const ensureTrailingDirectorySeparator: (path: string) => string = (ts as any).ensureTrailingDirectorySeparator;
	const getDirectoryPath: (path: string) => string = (ts as any).getDirectoryPath;
	const directorySeparator: string = (ts as any).directorySeparator;
	const executingFilePath = findArgument(args, '--executingFilePath') || location + '';
	const getExecutingDirectoryPath = memoize(() => memoize(() => ensureTrailingDirectorySeparator(getDirectoryPath(executingFilePath))));
	// Later we could map ^memfs:/ to do something special if we want to enable more functionality like module resolution or something like that
	const getWebPath = (path: string) => path.startsWith(directorySeparator) ? path.replace(directorySeparator, getExecutingDirectoryPath()) : undefined;


	return {
		watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
			watchFiles.set(path, { path, callback, pollingInterval, options });
			watchId++;
			fsWatcher.postMessage({ type: 'watchFile', uri: toResource(path), id: watchId });
			return {
				close() {
					watchFiles.delete(path);
					fsWatcher.postMessage({ type: 'dispose', id: watchId });
				}
			};
		},
		watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
			watchDirectories.set(path, { path, callback, recursive, options });
			watchId++;
			fsWatcher.postMessage({ type: 'watchDirectory', recursive, uri: toResource(path), id: watchId });
			return {
				close() {
					watchDirectories.delete(path);
					fsWatcher.postMessage({ type: 'dispose', id: watchId });
				}
			};
		},
		setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
			return setTimeout(callback, ms, ...args);
		},
		clearTimeout(timeoutId: any): void {
			clearTimeout(timeoutId);
		},
		setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
			return this.setTimeout(callback, 0, ...args);
		},
		clearImmediate(timeoutId: any): void {
			this.clearTimeout(timeoutId);
		},
		importPlugin: async (root, moduleName) => {
			const packageRoot = combinePaths(root, moduleName);

			let packageJson: any | undefined;
			try {
				const packageJsonResponse = await fetch(combinePaths(packageRoot, 'package.json'));
				packageJson = await packageJsonResponse.json();
			} catch (e) {
				return { module: undefined, error: new Error(`Could not load plugin. Could not load 'package.json'.`) };
			}

			const browser = packageJson.browser;
			if (!browser) {
				return { module: undefined, error: new Error(`Could not load plugin. No 'browser' field found in package.json.`) };
			}

			const scriptPath = combinePaths(packageRoot, browser);
			try {
				const { default: module } = await import(/* webpackIgnore: true */scriptPath);
				return { module, error: undefined };
			} catch (e) {
				return { module: undefined, error: e };
			}
		},
		args,
		newLine: '\n',
		useCaseSensitiveFileNames: true,
		write: s => {
			apiClient?.vscode.terminal.write(s);
		},
		writeOutputIsTTY() {
			return true;
		},
		readFile(path) {
			if (!fs) {
				const webPath = getWebPath(path);
				if (webPath) {
					const request = new XMLHttpRequest();
					request.open('GET', webPath, /* asynchronous */ false);
					request.send();
					return request.status === 200 ? request.responseText : undefined;
				} else {
					return undefined;
				}
			}

			try {
				// @vscode/sync-api-common/connection says that Uint8Array is only a view on the bytes, so slice is needed
				return new TextDecoder().decode(new Uint8Array(fs.readFile(toResource(path))).slice());
			} catch (e) {
				logger.info(`Error fs.readFile`);
				logger.info(JSON.stringify(e));
				return undefined;
			}
		},
		getFileSize(path) {
			if (!fs) {
				throw new Error('not supported');
			}

			try {
				return fs.stat(toResource(path)).size;
			} catch (e) {
				logger.info(`Error fs.getFileSize`);
				logger.info(JSON.stringify(e));
				return 0;
			}
		},
		writeFile(path, data, writeByteOrderMark) {
			if (!fs) {
				throw new Error('not supported');
			}
			if (writeByteOrderMark) {
				data = byteOrderMarkIndicator + data;
			}
			try {
				fs.writeFile(toResource(path), new TextEncoder().encode(data));
			} catch (e) {
				logger.info(`Error fs.writeFile`);
				logger.info(JSON.stringify(e));
			}
		},
		resolvePath(path: string): string {
			return path;
		},
		fileExists(path: string): boolean {
			if (!fs) {
				const webPath = getWebPath(path);
				if (!webPath) {
					return false;
				}

				const request = new XMLHttpRequest();
				request.open('HEAD', webPath, /* asynchronous */ false);
				request.send();
				return request.status === 200;
			}

			try {
				return fs.stat(toResource(path)).type === FileType.File;
			} catch (e) {
				logger.info(`Error fs.fileExists for ${path}`);
				logger.info(JSON.stringify(e));
				return false;
			}
		},
		directoryExists(path: string): boolean {
			if (!fs) {
				return false;
			}

			try {
				return fs.stat(toResource(path)).type === FileType.Directory;
			} catch (e) {
				logger.info(`Error fs.directoryExists for ${path}`);
				logger.info(JSON.stringify(e));
				return false;
			}
		},
		createDirectory(path: string): void {
			if (!fs) {
				throw new Error('not supported');
			}

			try {
				fs.createDirectory(toResource(path));
			} catch (e) {
				logger.info(`Error fs.createDirectory`);
				logger.info(JSON.stringify(e));
			}
		},
		getExecutingFilePath(): string {
			return currentDirectory;
		},
		getCurrentDirectory(): string {
			return currentDirectory;
		},
		getDirectories(path: string): string[] {
			return getAccessibleFileSystemEntries(path).directories.slice();
		},
		readDirectory(path: string, extensions?: readonly string[], excludes?: readonly string[], includes?: readonly string[], depth?: number): string[] {
			return matchFiles(path, extensions, excludes, includes, /*useCaseSensitiveFileNames*/ true, currentDirectory, depth, getAccessibleFileSystemEntries, realpath);
		},
		getModifiedTime(path: string): Date | undefined {
			if (!fs) {
				throw new Error('not supported');
			}

			try {
				return new Date(fs.stat(toResource(path)).mtime);
			} catch (e) {
				logger.info(`Error fs.getModifiedTime`);
				logger.info(JSON.stringify(e));
				return undefined;
			}
		},
		deleteFile(path: string): void {
			if (!fs) {
				throw new Error('not supported');
			}

			try {
				fs.delete(toResource(path));
			} catch (e) {
				logger.info(`Error fs.deleteFile`);
				logger.info(JSON.stringify(e));
			}
		},
		createHash: generateDjb2Hash,
		/** This must be cryptographically secure.
			The browser implementation, crypto.subtle.digest, is async so not possible to call from tsserver. */
		createSHA256Hash: undefined,
		exit(): void {
			removeEventListener('message', listener);
		},
		realpath,
		base64decode: input => Buffer.from(input, 'base64').toString('utf8'),
		base64encode: input => Buffer.from(input).toString('base64'),
	};

	/** For module resolution only; symlinks aren't supported yet. */
	function realpath(path: string): string {
		// skip paths without .. or ./ or /.
		if (!path.match(/\.\.|\/\.|\.\//)) {
			return path;
		}
		const uri = toResource(path);
		const out = [uri.scheme];
		if (uri.authority) { out.push(uri.authority); }
		for (const part of uri.path.split('/')) {
			switch (part) {
				case '':
				case '.':
					break;
				case '..':
					//delete if there is something there to delete
					out.pop();
					break;
				default:
					out.push(part);
			}
		}
		return '/' + out.join('/');
	}

	function getAccessibleFileSystemEntries(path: string): { files: readonly string[]; directories: readonly string[] } {
		if (!fs) {
			throw new Error('not supported');
		}

		try {
			const uri = toResource(path || '.');
			const entries = fs.readDirectory(uri);
			const files: string[] = [];
			const directories: string[] = [];
			for (const [entry, type] of entries) {
				// This is necessary because on some file system node fails to exclude
				// '.' and '..'. See https://github.com/nodejs/node/issues/4002
				if (entry === '.' || entry === '..') {
					continue;
				}

				if (type === FileType.File) {
					files.push(entry);
				}
				else if (type === FileType.Directory) {
					directories.push(entry);
				}
			}
			files.sort();
			directories.sort();
			return { files, directories };
		} catch (e) {
			return { files: [], directories: [] };
		}
	}

	/**
	 * Copied from toResource in typescriptServiceClient.ts
	 */
	function toResource(filepath: string) {
		if (filepath.startsWith('/lib.') && filepath.endsWith('.d.ts')) {
			return URI.from({
				scheme: extensionUri.scheme,
				authority: extensionUri.authority,
				path: extensionUri.path + '/dist/browser/typescript/' + filepath.slice(1)
			});
		}
		const parts = filepath.match(/^\/([^\/]+)\/([^\/]*)(?:\/(.+))?$/);
		if (!parts) {
			throw new Error('complex regex failed to match ' + filepath);
		}
		return URI.parse(parts[1] + '://' + (parts[2] === 'ts-nul-authority' ? '' : parts[2]) + (parts[3] ? '/' + parts[3] : ''));
	}
}

class WasmCancellationToken implements ts.server.ServerCancellationToken {
	shouldCancel: (() => boolean) | undefined;
	currentRequestId: number | undefined = undefined;
	setRequest(requestId: number) {
		this.currentRequestId = requestId;
	}
	resetRequest(requestId: number) {
		if (requestId === this.currentRequestId) {
			this.currentRequestId = undefined;
		} else {
			throw new Error(`Mismatched request id, expected ${this.currentRequestId} but got ${requestId}`);
		}
	}
	isCancellationRequested(): boolean {
		return this.currentRequestId !== undefined && !!this.shouldCancel && this.shouldCancel();
	}
}

interface StartSessionOptions {
	globalPlugins: ts.server.SessionOptions['globalPlugins'];
	pluginProbeLocations: ts.server.SessionOptions['pluginProbeLocations'];
	allowLocalPluginLoads: ts.server.SessionOptions['allowLocalPluginLoads'];
	useSingleInferredProject: ts.server.SessionOptions['useSingleInferredProject'];
	useInferredProjectPerProjectRoot: ts.server.SessionOptions['useInferredProjectPerProjectRoot'];
	suppressDiagnosticEvents: ts.server.SessionOptions['suppressDiagnosticEvents'];
	noGetErrOnBackgroundUpdate: ts.server.SessionOptions['noGetErrOnBackgroundUpdate'];
	syntaxOnly: ts.server.SessionOptions['syntaxOnly'];
	serverMode: ts.server.SessionOptions['serverMode'];
}
class WorkerSession extends ts.server.Session<{}> {
	wasmCancellationToken: WasmCancellationToken;
	listener: (message: any) => void;
	constructor(
		host: ts.server.ServerHost,
		options: StartSessionOptions,
		public port: MessagePort,
		logger: ts.server.Logger,
		hrtime: ts.server.SessionOptions['hrtime']
	) {
		const cancellationToken = new WasmCancellationToken();
		super({
			host,
			cancellationToken,
			...options,
			typingsInstaller: ts.server.nullTypingsInstaller, // TODO: Someday!
			byteLength: () => { throw new Error('Not implemented'); }, // Formats the message text in send of Session which is overriden in this class so not needed
			hrtime,
			logger,
			canUseEvents: true,
		});
		this.wasmCancellationToken = cancellationToken;
		this.listener = (message: any) => {
			// TEMP fix since Cancellation.retrieveCheck is not correct
			function retrieveCheck2(data: any) {
				if (!globalThis.crossOriginIsolated || !(data.$cancellationData instanceof SharedArrayBuffer)) {
					return () => false;
				}
				const typedArray = new Int32Array(data.$cancellationData, 0, 1);
				return () => {
					return Atomics.load(typedArray, 0) === 1;
				};
			}

			const shouldCancel = retrieveCheck2(message.data);
			if (shouldCancel) {
				this.wasmCancellationToken.shouldCancel = shouldCancel;
			}
			this.onMessage(message.data);
		};
	}
	public override send(msg: ts.server.protocol.Message) {
		if (msg.type === 'event' && !this.canUseEvents) {
			if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
				this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
			}
			return;
		}
		if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
			this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
		}
		this.port.postMessage(msg);
	}
	protected override parseMessage(message: {}): ts.server.protocol.Request {
		return message as ts.server.protocol.Request;
	}
	protected override toStringMessage(message: {}) {
		return JSON.stringify(message, undefined, 2);
	}
	override exit() {
		this.logger.info('Exiting...');
		this.port.removeEventListener('message', this.listener);
		this.projectService.closeLog();
		close();
	}
	listen() {
		this.logger.info(`webServer.ts: tsserver starting to listen for messages on 'message'...`);
		this.port.onmessage = this.listener;
	}
}
// END webServer/webServer.ts
// BEGIN tsserver/webServer.ts
function parseServerMode(args: string[]): ts.LanguageServiceMode | string | undefined {
	const mode = findArgument(args, '--serverMode');
	if (!mode) { return undefined; }

	switch (mode.toLowerCase()) {
		case 'semantic':
			return ts.LanguageServiceMode.Semantic;
		case 'partialsemantic':
			return ts.LanguageServiceMode.PartialSemantic;
		case 'syntactic':
			return ts.LanguageServiceMode.Syntactic;
		default:
			return mode;
	}
}

function hrtime(previous?: number[]) {
	const now = self.performance.now() * 1e-3;
	let seconds = Math.floor(now);
	let nanoseconds = Math.floor((now % 1) * 1e9);
	// NOTE: This check is added probably because it's missed without strictFunctionTypes on
	if (previous?.[0] !== undefined && previous?.[1] !== undefined) {
		seconds = seconds - previous[0];
		nanoseconds = nanoseconds - previous[1];
		if (nanoseconds < 0) {
			seconds--;
			nanoseconds += 1e9;
		}
	}
	return [seconds, nanoseconds];
}

// END tsserver/webServer.ts
// BEGIN tsserver/server.ts
function hasArgument(args: readonly string[], name: string): boolean {
	return args.indexOf(name) >= 0;
}
function findArgument(args: readonly string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return 0 <= index && index < args.length - 1
		? args[index + 1]
		: undefined;
}
function findArgumentStringArray(args: readonly string[], name: string): readonly string[] {
	const arg = findArgument(args, name);
	return arg === undefined ? [] : arg.split(',').filter(name => name !== '');
}

async function initializeSession(args: string[], extensionUri: URI, platform: string, ports: { tsserver: MessagePort; sync: MessagePort; watcher: MessagePort }, logger: ts.server.Logger): Promise<void> {
	const modeOrUnknown = parseServerMode(args);
	const serverMode = typeof modeOrUnknown === 'number' ? modeOrUnknown : undefined;
	const unknownServerMode = typeof modeOrUnknown === 'string' ? modeOrUnknown : undefined;
	const syntaxOnly = hasArgument(args, '--syntaxOnly');
	logger.info(`Starting TS Server`);
	logger.info(`Version: 0.0.0`);
	logger.info(`Arguments: ${args.join(' ')}`);
	logger.info(`Platform: ${platform} CaseSensitive: true`);
	logger.info(`ServerMode: ${serverMode} syntaxOnly: ${syntaxOnly} unknownServerMode: ${unknownServerMode}`);
	const options = {
		globalPlugins: findArgumentStringArray(args, '--globalPlugins'),
		pluginProbeLocations: findArgumentStringArray(args, '--pluginProbeLocations'),
		allowLocalPluginLoads: hasArgument(args, '--allowLocalPluginLoads'),
		useSingleInferredProject: hasArgument(args, '--useSingleInferredProject'),
		useInferredProjectPerProjectRoot: hasArgument(args, '--useInferredProjectPerProjectRoot'),
		suppressDiagnosticEvents: hasArgument(args, '--suppressDiagnosticEvents'),
		noGetErrOnBackgroundUpdate: hasArgument(args, '--noGetErrOnBackgroundUpdate'),
		syntaxOnly,
		serverMode
	};

	let sys: ServerHostWithImport;
	if (hasArgument(args, '--enableProjectWideIntelliSenseOnWeb')) {
		const connection = new ClientConnection<Requests>(ports.sync);
		await connection.serviceReady();

		sys = createServerHost(extensionUri, logger, new ApiClient(connection), args, ports.watcher);
	} else {
		sys = createServerHost(extensionUri, logger, undefined, args, ports.watcher);

	}

	setSys(sys);
	session = new WorkerSession(sys, options, ports.tsserver, logger, hrtime);
	session.listen();
}


let hasInitialized = false;
const listener = async (e: any) => {
	if (!hasInitialized) {
		hasInitialized = true;
		if ('args' in e.data) {
			const logger: ts.server.Logger = {
				close: () => { },
				hasLevel: level => level <= ts.server.LogLevel.verbose,
				loggingEnabled: () => true,
				perftrc: () => { },
				info: s => postMessage({ type: 'log', body: s + '\n' }),
				msg: s => postMessage({ type: 'log', body: s + '\n' }),
				startGroup: () => { },
				endGroup: () => { },
				getLogFileName: () => 'tsserver.log',
			};
			const [sync, tsserver, watcher] = e.ports as MessagePort[];
			const extensionUri = URI.from(e.data.extensionUri);
			watcher.onmessage = (e: any) => updateWatch(e.data.event, URI.from(e.data.uri), extensionUri);
			await initializeSession(e.data.args, extensionUri, 'vscode-web', { sync, tsserver, watcher }, logger);
		} else {
			console.error('unexpected message in place of initial message: ' + JSON.stringify(e.data));
		}
		return;
	}
	console.error(`unexpected message on main channel: ${JSON.stringify(e)}`);
};
addEventListener('message', listener);
// END tsserver/server.ts
