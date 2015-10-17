"use strict";

const ns = require('node-static');
const fs = require('fs');
const http = require('http');
const mime = require('mime');
const path = require('path');
const marked = require('marked');
const glob = require('glob');
const parseUrl = require('url').parse;
const util = require('util');
const notebookRoot = "/Users/jason/Dropbox/notebook";

const staticFiles = {
	templates: new ns.Server(__dirname + '/tpl'),
	pub: new ns.Server(__dirname + '/public')
};

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
        var converter = types[sourceType].convert && types[sourceType].convert[targetType];
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
                        '<img src="' + req.fileUrl() + '">' +
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
    md: {
    	mimeType: 'text/markdown; charset=UTF-8',
    	convert: {
    		html: function(ctx, req, res) {
    			var md = fs.readFileSync(req.sourcePath(), 'utf8');
    			var html = marked(md);
    			return htmlResponse(res, html);
    		}
    	}
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
        return _error(404, 'Not Found');
    }

    if (requestUrl.path === '/') {
    	return staticFiles.templates.serveFile('/ui.htm', 200, {}, req, res);
	} else if (requestUrl.path.match(/^\/assets/)) {
		return staticFiles.pub.serve(req, res);
	}

    let requestPath = requestUrl.path.replace(/\/+/g, '/');

    resolvePage($notebook, requestPath, (err, pfr) => {
        if (err) {
        	if (err.type === 'redirect') {
        		return _redirect(err.path);
        	} else if (err.type === 'notfound') {
        		return _error(404, 'Not Found');
        	} else {
        		return _error(500, 'Internal Server Error');
        	}
        }
        console.log(pfr);
        if (pfr.translationRequired()) {
            var t = translator(pfr.sourceType, pfr.requestedType);
            if (t) {
                return t(null, pfr, res);
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

	function _error(status, message) {
		let responseText = message;
		res.writeHead(status, {
			'Content-Type': 'text/plain',
			'Content-Length': responseText.length
		});
		res.end(responseText, 'utf8');
	}

	function _redirect(path) {
		res.writeHead(302, {
			'Content-Length': 0,
			'Location': path
		});
		res.end();
	}
}).listen(8080);

function resolvePage(notebook, requestPath, cb) {
	var match = _parseRequestPath(requestPath);
	if (!match) return cb({type: 'notfound'});

	function _findFileWithBasename(document, file, wantsType) {
		var pattern = path.join(notebook.root, document, file + '.*');
		console.log("search pattern:", pattern);
		glob(pattern, function(err, matches) {
			console.log("matches:", matches);
			if (matches.length) {
				var sourceType = matches[0].substr(matches[0].lastIndexOf('.') + 1);
				cb(null, new PageFileRequest({
					notebook 		: notebook,
					document 		: document.replace(/\/$/, ''),
					file 			: file,
					sourceType		: sourceType,
					requestedType	: wantsType || sourceType
				}));
			} else {
				cb({type: 'notfound'});
			}
		});
	}

	let initialPath = path.join(notebook.root, requestPath);

	console.log("requestPath:", requestPath);
	console.log("initialPath:", initialPath);

	fs.stat(initialPath, (err, stat) => {
		if (match.extension) {
			if (err) {
				_findFileWithBasename(
					path.dirname(match.pagePath),
					path.basename(match.pagePath),
					match.extension
				);
			} else {
				console.log("exact match");
				cb(null, new PageFileRequest({
					notebook 		: notebook,
					document 		: path.dirname(match.pagePath),
					file 			: path.basename(match.pagePath),
					sourceType		: match.extension,
					requestedType	: match.extension
				}));
			}
		} else if (stat) {
			console.log("stat successful");
			if (!stat.isDirectory()) {
				cb({type: 'error', message: 'could not determine file type'});
			} else if (match.trailingSlash) {
				_findFileWithBasename(match.pagePath, 'index', 'html');
			} else {
				cb({type: 'redirect', path: requestPath + '/'});
			}
		} else {
			console.log("not found file, searching...");
			_findFileWithBasename(
				path.dirname(match.pagePath),
				path.basename(match.pagePath),
				'html'
			);
		}
	});
}

function _parseRequestPath(path) {
	var pagePath = '';
	var trailingSlash = false;
	var extension = null;
	var match;
	while (path.length) {
		if (path === '/' || path.match(/^(\/[a-z0-9][\w-]*)\.([\w-]+)$/i)) {
			if (path.length > 1) {
				pagePath += RegExp.$1;
				extension = RegExp.$2;
			} else {
				pagePath += path;
				trailingSlash = true;	
			}
			path = '';
		} else if (path.match(/^(\/[a-z0-9][\w-]*)(?=(?:\/|$))/)) {
			pagePath += RegExp.$1;
			path = path.substr(RegExp.$1.length);
		} else {
			return false;
		}
	}
	return {
		pagePath		: pagePath,
		trailingSlash	: trailingSlash,
		extension 		: extension
	};
}

function PageFileRequest(opts) {
	this.notebook = opts.notebook;
	this.document = opts.document;
	this.file = opts.file;
	this.sourceType = opts.sourceType;
	this.requestedType = opts.requestedType;
}

PageFileRequest.prototype.translationRequired = function() {
    return this.requestedType !== this.sourceType;
}

PageFileRequest.prototype.fileUrl = function() {
	return path.join(this.document, this.file) + '.' + this.sourceType;
}

PageFileRequest.prototype.sourcePath = function() {
    return path.join(this.notebook.root, this.document, this.file) + '.' + this.sourceType;
}