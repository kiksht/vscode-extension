// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as os from "os";
import * as fs from "fs";
import {
    window,
    workspace,
    commands,
    Disposable,
    ExtensionContext,
    StatusBarAlignment,
    StatusBarItem,
    TextDocument
} from "vscode";

const punctWordBoundary = /\b[-.,()&$#!\[\]{}"']+\B|\B[-.,()&$#!\[\]{}"']+\b/g;

// this method is called when your extension is activated. activation is
// controlled by the activation events defined in package.json
export function activate(ctx: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "Wordcount" is now active!');

    // create a new word counter
    let wordCounter = new WordCounter();
    let controller = new WordCounterController(wordCounter);

    // add to a list of disposables which are disposed when this extension
    // is deactivated again.
    ctx.subscriptions.push(controller);
    ctx.subscriptions.push(wordCounter);

    const dict = JSON.parse(
        fs.readFileSync("/Users/alex/src/kiksht/dictionary/data/dictionary.json", "utf-8")
    );

    vscode.languages.registerCompletionItemProvider("plaintext", {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position,
            token: vscode.CancellationToken
        ): vscode.CompletionItem[] | Thenable<vscode.CompletionItem[]> {
            const forms = [];
            const items = Object.keys(dict).map(k => {
                // k = k.replace(punctWordBoundary, "");
                const v = dict[k];

                const ci = new vscode.CompletionItem(v.root);
                ci.kind = vscode.CompletionItemKind.Class;

                let defn = `${v.definition}\n\n`;
                if (v.examples && v.examples.length > 0) {
                    defn += `Examples:\n`;
                    for (const ex of v.examples) {
                        defn += `* ${ex.kiksht} | ${ex.english}\n`;
                    }
                }
                ci.detail = `${v.root} [${v.partOfSpeech}]:`;
                ci.documentation = defn;

                if (v["forms"] !== undefined) {
                    v["forms"].forEach(({ kiksht, english }) => {
                        const formCi = new vscode.CompletionItem(kiksht);
                        formCi.kind = vscode.CompletionItemKind.Interface;

                        formCi.detail = `${kiksht} [${v.partOfSpeech}]:`;
                        let defn = `${english}\n\nForm of: ${v.root} [${v.partOfSpeech}]: ${
                            v.definition
                        }\n\n`;
                        if (v.examples && v.examples.length > 0) {
                            defn += `Examples:\n`;
                            for (const ex of v.examples) {
                                defn += `* ${ex.kiksht} | ${ex.english}\n`;
                            }
                        }
                        formCi.documentation = defn;
                        forms.push(formCi);
                    });
                }

                return ci;
            });

            return items.concat(forms);
        }

        // resolveCompletionItem(
        //     item: vscode.CompletionItem,
        //     token: vscode.CancellationToken
        // ): vscode.CompletionItem | Thenable<vscode.CompletionItem> {
        //     return item;
        // }
    });

    vscode.languages.registerHoverProvider("plaintext", {
        provideHover(document, position, token) {
            const w = currentWord(document, position).replace(punctWordBoundary, "");
            const entry = dict[w];
            if (entry !== undefined) {
                let hover = `**${entry.root}** [_${entry.partOfSpeech}_]: ${entry.definition}\n\n`;
                if (entry.examples && entry.examples.length > 0) {
                    hover += `Examples:\n`;
                    for (const ex of entry.examples) {
                        hover += `* **_${ex.kiksht}_** | ${ex.english}\n`;
                    }
                }
                return new vscode.Hover(hover);
            }

            for (const k of Object.keys(dict)) {
                const v = dict[k];
                if (v["forms"] !== undefined) {
                    console.log(v["forms"]);
                    for (const { kiksht, english } of v["forms"]) {
                        console.log(`'${kiksht}' '${w}' ${kiksht === w}`);
                        if (kiksht === w) {
                            let hover = `**${kiksht}** [_${
                                v.partOfSpeech
                            }_]: ${english}\n\nForm of: **${v.root}** [_${v.partOfSpeech}_]: ${
                                v.definition
                            }\n\n`;
                            if (v.examples && v.examples.length > 0) {
                                hover += `Examples:\n`;
                                for (const ex of v.examples) {
                                    hover += `* **_${ex.kiksht}_** | ${ex.english}\n`;
                                }
                            }
                            return new vscode.Hover(hover);
                        }
                    }
                }
            }
        }
    });
}

function currentWord(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    const lines = document.getText().split(os.EOL);
    let line = lines[position.line];

    let pos = position.character;
    let left = 0;
    let right = 0;
    while (true) {
        if (line.length == 0) {
            return;
        }
        right = line.search(" ");

        if (right == -1) {
            right = line.length;
        }

        if (left <= position.character && pos <= right) {
            return line.substring(0, right);
        }
        pos = pos - right - 1;
        left += right + 1;
        line = line.substring(right + 1);
    }
}

export class WordCounter {
    private _statusBarItem: StatusBarItem;

    public updateWordCount() {
        // Create as needed
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }

        // Get the current text editor
        let editor = window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }

        let doc = editor.document;

        // Only update status if an MD file
        if (doc.languageId === "markdown") {
            let wordCount = this._getWordCount(doc);

            // Update the status bar
            this._statusBarItem.text =
                wordCount !== 1 ? `$(pencil) ${wordCount} Words` : "$(pencil) 1 Word";
            this._statusBarItem.show();
        } else {
            this._statusBarItem.hide();
        }
    }

    public _getWordCount(doc: TextDocument): number {
        let docContent = doc.getText();

        // Parse out unwanted whitespace so the split is accurate
        docContent = docContent.replace(/(< ([^>]+)<)/g, "").replace(/\s+/g, " ");
        docContent = docContent.replace(/^\s\s*/, "").replace(/\s\s*$/, "");
        let wordCount = 0;
        if (docContent != "") {
            wordCount = docContent.split(" ").length;
        }

        return wordCount;
    }

    public dispose() {
        this._statusBarItem.dispose();
    }
}

class WordCounterController {
    private _wordCounter: WordCounter;
    private _disposable: Disposable;

    constructor(wordCounter: WordCounter) {
        this._wordCounter = wordCounter;
        this._wordCounter.updateWordCount();

        // subscribe to selection change and editor activation events
        let subscriptions: Disposable[] = [];
        window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        // create a combined disposable from both event subscriptions
        this._disposable = Disposable.from(...subscriptions);
    }

    private _onEvent() {
        this._wordCounter.updateWordCount();
    }

    public dispose() {
        this._disposable.dispose();
    }
}
