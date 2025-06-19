import * as vscode from 'vscode';
import { FileCollectorProvider } from './FileCollectorProvider';

export function activate(context: vscode.ExtensionContext) {
    const fileCollectorProvider = new FileCollectorProvider(
        vscode.workspace.workspaceFolders,
        context
    );

    vscode.window.registerTreeDataProvider('fileCollectorView', fileCollectorProvider);

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('file-collector.showMainMenu', () => {
            fileCollectorProvider.showMainMenu();
        }),
        vscode.commands.registerCommand('file-collector.collectFiles', async () => {
            const config = vscode.workspace.getConfiguration('fileCollector');
            const defaultExts = config.get<string[]>('defaultExtensions', ['js']);
            
            const fileExtensions = await vscode.window.showInputBox({
                prompt: 'Enter file extensions to collect (comma separated, e.g. "js,ts,txt")',
                placeHolder: defaultExts.join(','),
                value: defaultExts.join(',')
            });

            if (fileExtensions) {
                fileCollectorProvider.collectFiles(fileExtensions.split(',').map(e => e.trim()));
            }
        }),
        vscode.commands.registerCommand('file-collector.collectLastUsed', () => {
            fileCollectorProvider.collectLastUsed();
        }),
        vscode.commands.registerCommand('file-collector.clearOutput', () => {
            fileCollectorProvider.clearOutput();
        }),
        vscode.commands.registerCommand('file-collector.openOutput', () => {
            fileCollectorProvider.openOutputFile();
        }),
        vscode.commands.registerCommand('file-collector.changeOutputPath', async () => {
            const newPath = await vscode.window.showInputBox({
                prompt: 'Enter new output file name (e.g. "output.txt")',
                value: fileCollectorProvider.outputFileName
            });
            if (newPath) {
                fileCollectorProvider.changeOutputPath(newPath);
            }
        }),
        vscode.commands.registerCommand('file-collector.selectFolders', () => {
            fileCollectorProvider.selectFolders();
        }),
        vscode.commands.registerCommand('file-collector.setFileFilters', () => {
            fileCollectorProvider.setFileFilters();
        })
    );
}

export function deactivate() {}
