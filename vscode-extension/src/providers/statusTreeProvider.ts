/**
 * Status TreeView Provider
 * 
 * Displays connection and index status in the sidebar.
 */

import * as vscode from 'vscode';
import { ContextEngineClient, IndexStatus } from '../client';

export class StatusTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly icon?: string
    ) {
        super(label, collapsibleState);
        this.description = value;
        if (icon) {
            this.iconPath = new vscode.ThemeIcon(icon);
        }
    }
}

export class StatusTreeProvider implements vscode.TreeDataProvider<StatusTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StatusTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private client: ContextEngineClient;
    private status: IndexStatus | null = null;

    constructor(client: ContextEngineClient) {
        this.client = client;
    }

    /**
     * Refresh the tree view.
     */
    async refresh(): Promise<void> {
        if (this.client.isConnected()) {
            try {
                this.status = await this.client.getStatus();
            } catch (error) {
                this.status = null;
            }
        } else {
            this.status = null;
        }
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item for display.
     */
    getTreeItem(element: StatusTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item.
     */
    getChildren(element?: StatusTreeItem): StatusTreeItem[] {
        if (element) {
            return [];
        }

        const items: StatusTreeItem[] = [];

        // Connection status
        if (this.client.isConnected()) {
            items.push(new StatusTreeItem(
                'Connection',
                `Connected (v${this.client.getVersion()})`,
                vscode.TreeItemCollapsibleState.None,
                'plug'
            ));

            if (this.status) {
                // Index status
                const statusIcon = this.status.status === 'indexing' ? 'sync~spin' :
                    this.status.status === 'error' ? 'error' : 'check';
                items.push(new StatusTreeItem(
                    'Status',
                    this.status.status,
                    vscode.TreeItemCollapsibleState.None,
                    statusIcon
                ));

                // File count
                items.push(new StatusTreeItem(
                    'Files Indexed',
                    String(this.status.fileCount),
                    vscode.TreeItemCollapsibleState.None,
                    'file'
                ));

                // Last indexed
                items.push(new StatusTreeItem(
                    'Last Indexed',
                    this.status.lastIndexed || 'Never',
                    vscode.TreeItemCollapsibleState.None,
                    'history'
                ));

                // Stale indicator
                if (this.status.isStale) {
                    items.push(new StatusTreeItem(
                        'Index',
                        'Stale - needs reindex',
                        vscode.TreeItemCollapsibleState.None,
                        'warning'
                    ));
                }

                // Workspace
                items.push(new StatusTreeItem(
                    'Workspace',
                    this.status.workspace,
                    vscode.TreeItemCollapsibleState.None,
                    'folder'
                ));
            }
        } else {
            items.push(new StatusTreeItem(
                'Connection',
                'Disconnected',
                vscode.TreeItemCollapsibleState.None,
                'debug-disconnect'
            ));
        }

        return items;
    }
}
