/**
 * Copyright (C) Animal Logic Pty Ltd. All rights reserved.
 */

'use strict';
const vscode = require("vscode");
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const open = util.promisify(fs.open);
const read = util.promisify(fs.read);
const close = util.promisify(fs.close);

const maxUsdFileSize = 1024 * 1024 * 500; // 500 MB

async function isUsdcFile(path) {
  // Try to read the file header.
  try {
    const fd = await open(path, 'r');
    var buffer = Buffer.alloc(8);
    await read(fd, buffer, 0, 8, 0);
    const isUsdc = buffer.toString() == "PXR-USDC";
    await close(fd);
    return isUsdc;
  }
  catch (err) {
  }
  // Fallback to file extension.
  return path.endsWith(".usdc");
}

async function resolveAsset(inputPath, anchorPath) {
  const template = vscode.workspace.getConfiguration().get('usd.resolve');
  const command = template.replace("{inputPath}", inputPath).replace("{anchorPath}", anchorPath);
  try {
    const { stdout, stderr } = await exec(command);
    let result = stdout.trim(); // Trim new line characters.
    if (result.length > 0) {
      var uri = vscode.Uri.file(result);
      if (await isUsdcFile(result)) {
        uri = uri.with({ scheme: "usdc" });
      }
      return uri
    }
  }
  catch(err) {
    return null;
  }
  return null;
}

async function catUsdFile(inputPath) {
  const template = vscode.workspace.getConfiguration().get('usd.cat');
  const command = template.replace("{inputPath}", inputPath);
  try {
    const { stdout, stderr } = await exec(command, { maxBuffer: maxUsdFileSize });
    const result = stdout.trim(); // Trim new line characters.
    if (result.length > 0) {
      return result;
    }
    return null;
  }
  catch (err) {
    const message = err && err.message ? err.message : String(err);
    vscode.window.showErrorMessage(
      'Failed to convert "' + inputPath + '" with usdcat. If usdcat is not on your PATH, set the `usd.cat` setting to the full path of the usdcat executable (on Windows this may be usdcat.cmd). ' + message
    );
    throw err;
  }
}

function getAssets(document, lineNum) {
  const results = [];
  const line = document.lineAt(lineNum);
  var assetType = 0;
  var start = 0;
  var end = 0;
  for (var i = line.firstNonWhitespaceCharacterIndex; i < line.text.length; i++) {
    if (line.text[i] == '@') {
      if (assetType == 0) {
        if(i + 2 < line.text.length && line.text[i + 1] == '@' && line.text[i + 2] == '@') {
          assetType = 3;
        }
        else {
          assetType = 1;
        }
        start = i;
      }
      else if (assetType == 1) {
        assetType = 0;
        end = i;
        const text = line.text.substring(start + 1, end);
        const range = new vscode.Range(new vscode.Position(lineNum, start + 1), new vscode.Position(lineNum, end));
        results.push({ text: text, range: range });
      }
      else if (assetType == 3) {
        if (i + 2 < line.text.length && line.text[i + 1] == '@' && line.text[i + 2] == '@') {
          assetType = 0;
          end = i;
          const text = line.text.substring(start + 3, end);
          const range = new vscode.Range(new vscode.Position(lineNum, start + 1), new vscode.Position(lineNum, end));
          results.push({ text: text, range: range });
        }
      }
    }
  }
  return results;
}

function findDefinition(document, definition, token) {
  let path = definition.split('/').filter(Boolean);
  if (path.length == 0) return null;
  let current = 0;
  for (let line = 0; line < document.lineCount; line++) {
    if (token.isCancellationRequested) {
      return null;
    }
    let matches = document.lineAt(line).text.match('(?<=(over|def|class) [^"]*\")[^"]+');
    if (matches) {
      for (let m = 0; m < matches.length; m++) {
        if (token.isCancellationRequested) {
          return null;
        }
        const required = path[current];
        const actual = matches[0];
        if (required == actual) {
          current++;
          if (current == path.length) {
            return new vscode.Range(line, matches.index, line, matches.index + actual.length);
          }
        }
      }
    }
  }
}

function getPaths(document, lineNum) {
  const results = [];
  const line = document.lineAt(lineNum);
  var start = 0;
  var end = 0;
  for (var i = line.firstNonWhitespaceCharacterIndex; i < line.text.length; i++) {
    if (line.text[i] == '<') {
      start = i;
    }
    else if (line.text[i] == '>') {
      end = i;
      const text = line.text.substring(start + 1, end);
      const range = new vscode.Range(new vscode.Position(lineNum, start + 1), new vscode.Position(lineNum, end));
      results.push({ text: text, range: range });
    }
  }
  return results;
}

class HoverProvider {
  async provideHover(document, position, token) {
    const assets = getAssets(document, position.line);
    for(var i = 0; i < assets.length; i++) {
      const asset = assets[i];
      if (asset.range.start.isBeforeOrEqual(position) && asset.range.end.isAfterOrEqual(position)) {
        const resolved = await resolveAsset(asset.text, document.fileName);
        if (resolved != null) {
          return new vscode.Hover([resolved.toString()], asset.range);
        }
        return new vscode.Hover(["Failed to resolve: " + asset.text], asset.range);
      }
    }
    const paths = getPaths(document, position.line);
    for(var i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.range.start.isBeforeOrEqual(position) && path.range.end.isAfterOrEqual(position)) {
        return new vscode.Hover([path.text], path.range);
      }
    }
    return null;
  }
}

class DefinitionProvider {
  provideDefinition(document, position, token) {
    const paths = getPaths(document, position.line);
    for(var i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.range.start.isBeforeOrEqual(position) && path.range.end.isAfterOrEqual(position)) {
        const definition = findDefinition(document, path.text, token);
        if (definition != null) {
          return new vscode.Location(document.uri, definition);
        }
      }
    }
    return null;
  }
}

class DocumentLinkProvider {
  provideDocumentLinks(document, token) {
    const results = [];
    for (var line = 0; line < document.lineCount; line++) {
      const assets = getAssets(document, line);
      for (var i = 0; i < assets.length; i++) {
        if (token.isCancellationRequested) {
          break;
        }
        const asset = assets[i];
        const link = new vscode.DocumentLink(asset.range, null);
        link.path = asset.text;
        link.fileName = document.fileName;
        results.push(link);
      }
    }
    return results;
  }
  async resolveDocumentLink(link, token) {
    if (link.target == null) {
      link.target = await resolveAsset(link.path, link.fileName);
    }
    return link;
  }
}

// vs code doesn't currently provide a way to open binary files as text so we pretend that usdc files are virtual documents.
class TextDocumentContentProvider {
  async provideTextDocumentContent(uri) {
    return catUsdFile(uri.fsPath);
  }
};

async function openAsUsda(uri) {
  uri = uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document && vscode.window.activeTextEditor.document.uri);
  if (!uri) {
    vscode.window.showErrorMessage('No USD file selected to open as USDA.');
    return;
  }
  // usdc: URIs are already virtual USDA text documents; opening them again would be a no-op.
  const previewUri = uri.scheme === 'usdc' ? uri : uri.with({ scheme: 'usdc' });
  try {
    const doc = await vscode.workspace.openTextDocument(previewUri);
    await vscode.languages.setTextDocumentLanguage(doc, 'usd');
    await vscode.window.showTextDocument(doc, { preview: false });
  }
  catch (err) {
    const message = err && err.message ? err.message : String(err);
    vscode.window.showErrorMessage(
      'Failed to open "' + (uri.fsPath || previewUri.toString()) + '" as USDA. If usdcat is not on your PATH, set the `usd.cat` setting to the full path of the usdcat executable (on Windows this may be usdcat.cmd). ' + message
    );
  }
}

// Explorer double-click on *.usdc opens this custom editor; we immediately
// redirect to the usdc: virtual text document and close the empty webview.
// usdc: documents are handled by TextDocumentContentProvider / the text
// editor, not this provider, so this should not loop. The scheme check is
// an extra guard in case a usdc: URI is ever routed here.
class UsdcRedirectEditor {
  openCustomDocument(uri) {
    return { uri: uri, dispose() {} };
  }
  async resolveCustomEditor(document, webviewPanel) {
    try {
      if (document.uri && document.uri.scheme !== 'usdc') {
        await vscode.commands.executeCommand('usd.openAsUsda', document.uri);
      }
    }
    finally {
      webviewPanel.dispose();
    }
  }
}

async function activate(context) {
  context.subscriptions.push(vscode.languages.registerHoverProvider('usd', new HoverProvider()));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider('usd', new DefinitionProvider()));
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider('usd', new DocumentLinkProvider()));
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("usdc", new TextDocumentContentProvider()));
  context.subscriptions.push(vscode.commands.registerCommand('usd.openAsUsda', openAsUsda));
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('usd.usdcViewer', new UsdcRedirectEditor()));
}
exports.activate = activate;

async function deactivate() {

}
exports.deactivate = deactivate;