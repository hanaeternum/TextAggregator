import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface CollectionConfig {
    extensions: string[];
    excludePatterns: string[];
    maxFileSizeMB: number;
    selectedFolders?: string[];
}

export class FileCollectorProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private files: FileItem[] = [];
    private outputPath: string = '';
    private isLoading = false;
    private lastUsedConfig: CollectionConfig = {
        extensions: [],
        excludePatterns: [],
        maxFileSizeMB: 5
    };
    private selectedWorkspaceFolders: string[] = [];

    constructor(
        private workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
        private context: vscode.ExtensionContext
    ) {
        this.initConfiguration();
        this.loadLastUsedConfig();
    }

    private initConfiguration() {
        const config = vscode.workspace.getConfiguration('fileCollector');
        this.outputPath = path.join(this.getWorkspaceRoot(), config.get<string>('outputFileName', 'collected_files.txt'));
        
        if (this.workspaceFolders) {
            this.selectedWorkspaceFolders = this.workspaceFolders.map(f => f.uri.fsPath);
        }
    }

    private async loadLastUsedConfig() {
        const savedConfig = this.context.globalState.get<CollectionConfig>('lastUsedConfig');
        if (savedConfig) {
            this.lastUsedConfig = savedConfig;
        } else {
            const config = vscode.workspace.getConfiguration('fileCollector');
            this.lastUsedConfig = {
                extensions: config.get<string[]>('defaultExtensions', ['js']),
                excludePatterns: config.get<string[]>('excludePatterns', []),
                maxFileSizeMB: config.get<number>('maxFileSizeMB', 5)
            };
        }
    }

    private getWorkspaceRoot(): string {
        return this.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    public async showMainMenu(): Promise<void> {
        const options = [
            { label: '$(file-code) 收集文件', description: '按扩展名收集文件', command: 'file-collector.collectFiles' },
            { label: '$(history) 使用上次配置收集', description: '使用上次的设置', command: 'file-collector.collectLastUsed' },
            { label: '$(folder-active) 选择文件夹', description: '选择要收集的文件夹', command: 'file-collector.selectFolders' },
            { label: '$(filter) 设置文件过滤器', description: '设置扩展名和排除模式', command: 'file-collector.setFileFilters' },
            { label: '$(go-to-file) 打开输出文件', description: '查看收集结果', command: 'file-collector.openOutput' },
            { label: '$(trash) 清除输出', description: '清除收集结果', command: 'file-collector.clearOutput' },
            { label: '$(file-directory) 配置输出路径', description: '修改输出文件路径', command: 'file-collector.changeOutputPath' }
        ];

        const selection = await vscode.window.showQuickPick(options, {
            placeHolder: '选择文件收集操作'
        });

        if (selection) {
            vscode.commands.executeCommand(selection.command);
        }
    }

    public async selectFolders(): Promise<void> {
        if (!this.workspaceFolders || this.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('没有可用的工作区文件夹');
            return;
        }

        const folderItems = this.workspaceFolders.map(folder => ({
            label: path.basename(folder.uri.fsPath),
            description: folder.uri.fsPath,
            picked: this.selectedWorkspaceFolders.includes(folder.uri.fsPath)
        }));

        const selections = await vscode.window.showQuickPick(folderItems, {
            placeHolder: '选择要收集的文件夹 (可多选)',
            canPickMany: true
        });

        if (selections) {
            this.selectedWorkspaceFolders = selections.map(s => s.description!);
            vscode.window.showInformationMessage(`已选择 ${selections.length} 个文件夹`);
        }
    }

    public async setFileFilters(): Promise<void> {
        const extensions = await vscode.window.showInputBox({
            prompt: '输入要收集的文件扩展名 (多个用逗号分隔，如: js,ts,txt)',
            value: this.lastUsedConfig.extensions.join(',')
        });

        const excludePatterns = await vscode.window.showInputBox({
            prompt: '输入要排除的文件模式 (多个用逗号分隔，如: **/node_modules/**,**/.git/**)',
            value: this.lastUsedConfig.excludePatterns.join(',')
        });

        const maxFileSize = await vscode.window.showInputBox({
            prompt: '输入最大文件大小(MB)',
            value: this.lastUsedConfig.maxFileSizeMB.toString(),
            validateInput: value => {
                const num = Number(value);
                return isNaN(num) || num <= 0 ? '请输入有效的正数' : null;
            }
        });

        if (extensions !== undefined) {
            this.lastUsedConfig.extensions = extensions.split(',').map(e => e.trim());
            await vscode.workspace.getConfiguration('fileCollector')
                .update('defaultExtensions', this.lastUsedConfig.extensions, true);
        }
        if (excludePatterns !== undefined) {
            this.lastUsedConfig.excludePatterns = excludePatterns.split(',').map(p => p.trim());
            await vscode.workspace.getConfiguration('fileCollector')
                .update('excludePatterns', this.lastUsedConfig.excludePatterns, true);
        }
        if (maxFileSize !== undefined) {
            this.lastUsedConfig.maxFileSizeMB = Number(maxFileSize);
            await vscode.workspace.getConfiguration('fileCollector')
                .update('maxFileSizeMB', this.lastUsedConfig.maxFileSizeMB, true);
        }

        await this.context.globalState.update('lastUsedConfig', this.lastUsedConfig);
    }

    public async collectFiles(extensions: string | string[]): Promise<void> {
        const config = {
            extensions: Array.isArray(extensions) ? extensions : [extensions],
            excludePatterns: this.lastUsedConfig.excludePatterns,
            maxFileSizeMB: this.lastUsedConfig.maxFileSizeMB,
            selectedFolders: this.selectedWorkspaceFolders
        };

        await this.collectWithConfig(config);
    }

    public async collectLastUsed(): Promise<void> {
        if (this.lastUsedConfig) {
            this.lastUsedConfig.selectedFolders = this.selectedWorkspaceFolders;
            await this.collectWithConfig(this.lastUsedConfig);
        } else {
            vscode.window.showInformationMessage('没有找到上次使用的配置');
        }
    }

    private async collectWithConfig(config: CollectionConfig): Promise<void> {
        if (this.selectedWorkspaceFolders.length === 0) {
            vscode.window.showErrorMessage('请先选择至少一个文件夹');
            return;
        }

        this.isLoading = true;
        this.refresh();

        try {
            const allFiles: string[] = [];
            for (const ext of config.extensions) {
                const files = await this.findFilesByExtension(
                    ext, 
                    config.excludePatterns, 
                    config.maxFileSizeMB,
                    config.selectedFolders
                );
                allFiles.push(...files);
            }

            this.files = allFiles.map(file => new FileItem(
                path.basename(file),
                file,
                vscode.TreeItemCollapsibleState.None,
                this.context,
                'file'
            ));

            await this.writeToOutputFile(allFiles);
            this.lastUsedConfig = config;
            await this.context.globalState.update('lastUsedConfig', config);
            
            vscode.window.showInformationMessage(
                `成功收集 ${allFiles.length} 个文件 (扩展名: ${config.extensions.join(', ')})`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`收集文件出错: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.isLoading = false;
            this.refresh();
        }
    }

    private async findFilesByExtension(
        extension: string,
        excludePatterns: string[],
        maxSizeMB: number,
        folders?: string[]
    ): Promise<string[]> {
        const pattern = `**/*.${extension}`;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        const exclude = `{${excludePatterns.join(',')}}`;
        
        let files: vscode.Uri[] = [];
        
        if (folders && folders.length > 0) {
            for (const folder of folders) {
                const relativePattern = new vscode.RelativePattern(folder, pattern);
                const folderFiles = await vscode.workspace.findFiles(relativePattern, exclude);
                files.push(...folderFiles);
            }
        } else {
            files = await vscode.workspace.findFiles(pattern, exclude);
        }

        return files
            .map(file => file.fsPath)
            .filter(fsPath => {
                try {
                    const stats = fs.statSync(fsPath);
                    return stats.size <= maxSizeBytes;
                } catch {
                    return false;
                }
            });
    }

    public clearOutput(): void {
        this.files = [];
        this.refresh();
        try {
            if (fs.existsSync(this.outputPath)) {
                fs.unlinkSync(this.outputPath);
                vscode.window.showInformationMessage('已清除输出文件');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`清除输出时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public get outputFileName(): string {
        return path.basename(this.outputPath);
    }

    public async openOutputFile(): Promise<void> {
        if (fs.existsSync(this.outputPath)) {
            const document = await vscode.workspace.openTextDocument(this.outputPath);
            await vscode.window.showTextDocument(document);
        } else {
            vscode.window.showErrorMessage('输出文件不存在，请先收集文件');
        }
    }

    public changeOutputPath(newFileName: string): void {
        if (!this.workspaceFolders || this.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('请先打开一个工作区文件夹');
            return;
        }

        this.outputPath = path.join(this.getWorkspaceRoot(), newFileName);
        vscode.window.showInformationMessage(`输出路径已修改为: ${this.outputPath}`);
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileItem): Thenable<FileItem[]> {
        if (this.isLoading) {
            return Promise.resolve([new FileItem(
                "正在收集文件中...",
                "",
                vscode.TreeItemCollapsibleState.None,
                this.context,
                'loading'
            )]);
        }

        if (!this.workspaceFolders || this.workspaceFolders.length === 0) {
            return Promise.resolve([new FileItem(
                "请先打开一个工作区文件夹",
                "",
                vscode.TreeItemCollapsibleState.None,
                this.context,
                'info'
            )]);
        }

        if (this.files.length === 0) {
            const items = [
                new FileItem(
                    "点击「收集文件」按钮开始",
                    "",
                    vscode.TreeItemCollapsibleState.None,
                    this.context,
                    'info'
                ),
                new FileItem(
                    `输出文件: ${this.outputFileName}`,
                    this.outputPath,
                    vscode.TreeItemCollapsibleState.None,
                    this.context,
                    'output'
                )
            ];

            if (this.lastUsedConfig?.extensions?.length > 0) {
                items.push(
                    new FileItem(
                        `上次收集: ${this.lastUsedConfig.extensions.join(', ')}`,
                        "",
                        vscode.TreeItemCollapsibleState.None,
                        this.context,
                        'history'
                    )
                );
            }

            if (this.selectedWorkspaceFolders.length > 0) {
                items.push(
                    new FileItem(
                        `已选文件夹: ${this.selectedWorkspaceFolders.length} 个`,
                        "",
                        vscode.TreeItemCollapsibleState.None,
                        this.context,
                        'folder'
                    )
                );
            }

            return Promise.resolve(items);
        }

        return Promise.resolve(this.files);
    }

    private async writeToOutputFile(filePaths: string[]): Promise<void> {
        const config = vscode.workspace.getConfiguration('fileCollector');
        const includeHeader = config.get<boolean>('includeFileHeader', true);
        
        let content = '';
        
        for (const filePath of filePaths) {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                if (includeHeader) {
                    content += `=== ${path.basename(filePath)} ===\n\n${fileContent}\n\n`;
                } else {
                    content += `${fileContent}\n\n`;
                }
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
            }
        }

        try {
            fs.writeFileSync(this.outputPath, content);
        } catch (error) {
            throw new Error(`写入输出文件失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        context: vscode.ExtensionContext,
        public readonly itemType: 'file' | 'info' | 'loading' | 'history' | 'output' | 'folder' = 'file'
    ) {
        super(label, collapsibleState);
        
        switch (itemType) {
            case 'file':
                this.tooltip = filePath;
                this.command = {
                    command: 'vscode.open',
                    title: '打开文件',
                    arguments: [vscode.Uri.file(filePath)]
                };
                this.iconPath = new vscode.ThemeIcon('file');
                break;
            case 'loading':
                this.iconPath = new vscode.ThemeIcon('loading~spin');
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            case 'history':
                this.iconPath = new vscode.ThemeIcon('history');
                break;
            case 'output':
                this.tooltip = filePath;
                this.command = {
                    command: 'file-collector.openOutput',
                    title: '打开输出文件'
                };
                this.iconPath = new vscode.ThemeIcon('file-text');
                break;
            case 'folder':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
        }
    }
}
