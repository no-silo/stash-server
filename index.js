"use strict";

const fs = require('fs');
const http = require('http');
const mime = require('mime');
const path = require('path');
const parseUrl = require('url').parse;
const util = require('util');
const notebookRoot = "/Users/jason/Dropbox/notebook";

function htmlResponse(res, html) {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', html.length);
    res.end(html, 'utf8');
}

function _makeImageConverter(targetFormat) {
    return function(req, res) {
        return htmlResponse(res, '<h3>converting image to: ' + targetFormat + '</h3>');
    }
}

function translator(sourceType, targetType) {
    while (sourceType) {
        var converter = types[sourceType].convert[targetType];
        if (converter) {
            return converter;
        }
        sourceType = types[sourceType].parent;
    }
    return null;
}

var types = {
    gif: {
        parent: 'image',
        mimeType: 'image/gif'
    },
    html: {
        mimeType: 'text/html'
    },
    image: {
        abstract: true,
        convert: {
            html: function(ctx, req, res) {
                var html = 
                    '<div style="background-color:black">' +
                        '<img src="' + req.sourcePath() + "'>" +
                    '</div>';
                return htmlResponse(res, html);
            },
            jpeg: _makeImageConverter('jpeg'),
            png: _makeImageConverter('png')
        }
    },
    jpeg: {
        parent: 'image',
        mimeType: 'image/jpeg'
    },
    png: {
        parent: 'image',
        mimeType: 'image/png'
    }
}

var extensions = {
    gif     : 'gif',
    htm     : 'html',
    html    : 'html',
    jpeg    : 'jpeg',
    jpg     : 'jpeg',
    png     : 'png'
};

function Notebook(root) {
    this.root = root;
}

var $notebook = new Notebook(notebookRoot);

http.createServer((req, res) => {
    let requestUrl = parseUrl(req.url);

    if (requestUrl.path === '/favicon.ico') {
        return _notFound();
    }

    let requestPath = requestUrl.path.replace(/\/+/g, '/');

    _resolvePage($notebook, requestPath, (err, pfr) => {
        if (err) return _notFound();
        if (pfr.translationRequired()) {
            var t = translator(pfr.sourceType, pfr.requestedType);
            if (t) {
                return converter(null, pfr, res);
            } else {
                let text = 'No conversion available from ' + pfr.sourceType + ' -> ' + pfr.requestedType;
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Length', text.length);
                res.end(text, 'utf8');
            }
        } else {
            fs.stat(pfr.sourcePath(), function(err, stat) {
                if (err) throw new Error("wtf");
                res.setHeader('Content-Type', types[pfr.sourceType].mimeType);
                res.setHeader('Content-Length', stat.size);
                fs.createReadStream(pfr.sourcePath()).pipe(res);
            });
        }
    });

    function _notFound() {
        let responseText = 'Not Found';
        res.writeHead(404, {
            'Content-Type': 'text/plain',
            'Content-Length': responseText.length
        });
        res.end(responseText);
    }
}).listen(8080);

function PageFileRequest() {
    this.notebook = null;
    this.document = null;
    this.file = null;
    this.sourceExtension = null;
    this.sourceType = null;
    this.requestedType = null;
}

PageFileRequest.prototype.translationRequired = function() {
    return this.requestedType !== this.sourceType;
}

PageFileRequest.prototype.sourcePath = function() {
    return path.join(this.notebook.root, this.document, this.file) + '.' + this.sourceExtension;
}

// return object with:
// document, file, requestedExtension, sourceExtension
function _resolvePage(notebook, path, cb) {
    var match = _parseRequestPath(path)
    if (!match) return cb(new Error());

    let initialPath = path.join(notebook.root, path);
    fs.stat(initialPath, function(err, stat) {
        if (match.extension) {
            if (err) {
                // _findFileWithBasename()
                // return _findFileWithBasename();
            } else {
                cb(null, {
                    filePath: initialPath,
                    extension: match.extension
                });
            }
        } else {
            if (stat.directory) {
                if (match.trailingSlash) {
                    // _findFileWithBasename(path, 'index', (err, p) => {

                    // });
                } else {
                    cb({type: 'redirect', path: path + '/'});
                }
            }
        }
    });

    function _findFileWithBasename(directory, basename) {

    }
}

function _parseRequestPath(path) {
    return true;
}