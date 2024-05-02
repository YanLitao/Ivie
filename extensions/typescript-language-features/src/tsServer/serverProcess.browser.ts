/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference lib='webworker' />
import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import { TypeScriptServiceConfiguration } from '../utils/configuration';
import { memoize } from '../utils/memoize';
import { TsServerProcess, TsServerProcessKind } from './server';
import { TypeScriptVersion } from './versionProvider';
import { ServiceConnection } from '@vscode/sync-api-common/browser';
import { Requests, ApiService } from '@vscode/sync-api-service';
import { TypeScriptVersionManager } from './versionManager';
import { FileWatcherManager } from './fileWatchingManager';
type BrowserWatchEvent = {
	type: 'watchDirectory' | 'watchFile';
	recursive?: boolean;
	uri: {
		scheme: string;
		authority: string;
		path: string;
	};
	id: number;
} | {
	type: 'dispose';
	id: number;
};

export class WorkerServerProcess implements TsServerProcess {
	public static fork(
		version: TypeScriptVersion,
		args: readonly string[],
		_kind: TsServerProcessKind,
		_configuration: TypeScriptServiceConfiguration,
		_versionManager: TypeScriptVersionManager,
		extensionUri: vscode.Uri,
	) {
		const tsServerPath = version.tsServerPath;
		const worker = new Worker(tsServerPath);
		return new WorkerServerProcess(worker, extensionUri, [
			...args,

			// Explicitly give TS Server its path so it can
			// load local resources
			'--executingFilePath', tsServerPath,
		]);
	}

	private readonly _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private readonly _onErrorHandlers = new Set<(err: Error) => void>();
	private readonly _onExitHandlers = new Set<(code: number | null, signal: string | null) => void>();
	private readonly watches = new FileWatcherManager();
	/** For communicating with TS server synchronously */
	private readonly tsserver: MessagePort;
	/** For communicating watches asynchronously */
	private readonly watcher: MessagePort;
	/** For communicating with filesystem synchronously */
	private readonly syncFs: MessagePort;

	public constructor(
		/** For logging and initial setup */
		private readonly mainChannel: Worker,
		extensionUri: vscode.Uri,
		args: readonly string[],
	) {
		const tsserverChannel = new MessageChannel();
		const watcherChannel = new MessageChannel();
		const syncChannel = new MessageChannel();
		this.tsserver = tsserverChannel.port2;
		this.watcher = watcherChannel.port2;
		this.syncFs = syncChannel.port2;
		this.tsserver.onmessage = (event) => {
			if (event.data.type === 'log') {
				console.error(`unexpected log message on tsserver channel: ${JSON.stringify(event)}`);
				return;
			}
			for (const handler of this._onDataHandlers) {
				handler(event.data);
			}
		};
		this.watcher.onmessage = (event: MessageEvent<BrowserWatchEvent>) => {
			switch (event.data.type) {
				case 'dispose': {
					this.watches.delete(event.data.id);
					break;
				}
				case 'watchDirectory':
				case 'watchFile': {
					this.watches.create(event.data.id, vscode.Uri.from(event.data.uri), /*watchParentDirs*/ true, !!event.data.recursive, {
						change: uri => this.watcher.postMessage({ type: 'watch', event: 'change', uri }),
						create: uri => this.watcher.postMessage({ type: 'watch', event: 'create', uri }),
						delete: uri => this.watcher.postMessage({ type: 'watch', event: 'delete', uri }),
					});
					break;
				}
				default:
					console.error(`unexpected message on watcher channel: ${JSON.stringify(event)}`);
			}
		};
		mainChannel.onmessage = (msg: any) => {
			// for logging only
			if (msg.data.type === 'log') {
				this.output.append(msg.data.body);
				return;
			}
			console.error(`unexpected message on main channel: ${JSON.stringify(msg)}`);
		};
		mainChannel.onerror = (err: ErrorEvent) => {
			console.error('error! ' + JSON.stringify(err));
			for (const handler of this._onErrorHandlers) {
				// TODO: The ErrorEvent type might be wrong; previously this was typed as Error and didn't have the property access.
				handler(err.error);
			}
		};
		this.output.append(`creating new MessageChannel and posting its port2 + args: ${args.join(' ')}\n`);
		mainChannel.postMessage(
			{ args, extensionUri },
			[syncChannel.port1, tsserverChannel.port1, watcherChannel.port1]
		);
		const connection = new ServiceConnection<Requests>(syncChannel.port2);
		new ApiService('vscode-wasm-typescript', connection);
		connection.signalReady();
		this.output.append('done constructing WorkerServerProcess\n');
	}

	@memoize
	private get output(): vscode.OutputChannel {
		return vscode.window.createOutputChannel(vscode.l10n.t("TypeScript Server Log"));
	}

	write(serverRequest: Proto.Request): void {
		this.tsserver.postMessage(serverRequest);
	}

	onData(handler: (response: Proto.Response) => void): void {
		this._onDataHandlers.add(handler);
	}

	onError(handler: (err: Error) => void): void {
		this._onErrorHandlers.add(handler);
	}

	onExit(handler: (code: number | null, signal: string | null) => void): void {
		this._onExitHandlers.add(handler);
		// Todo: not implemented
	}

	kill(): void {
		this.mainChannel.terminate();
		this.tsserver.close();
		this.watcher.close();
		this.syncFs.close();
	}
}

