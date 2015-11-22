"use strict";

const appy = require('appy-bird');
const async = require('async');
const fs = require('fs');
const http = require('http');
const mime = require('mime');
const path = require('path');
const glob = require('glob');
const parseUrl = require('url').parse;
const util = require('util');
const notebookRoot = "/Users/jason/Dropbox/notebook";

const types = require('./lib/types');
const extensions = {
    gif     : 'gif',
    htm     : 'html',
    html    : 'html',
    jpeg    : 'jpeg',
    jpg     : 'jpeg',
    png     : 'png'
};

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

appy({
	routes: [
		{
			path: /^\/assets\/[^$]+$/,
			directory: __dirname + '/public'
		},
		{
			path: '/_children',
			handler: function(req, params, r, res) {
				return findChildren(req.query.parent)
					.then(function(items) {
						return r.json(items);
					}, function(err) {
						return r.status(500);
					});
			}
		},
		{
			path: '/',
			file: __dirname + '/tpl/ui.htm'
		},
		{
			path: /^.*$/,
			handler: function(req, params, r, res) {
				let requestPath = req.uri.path.replace(/\/+/g, '/');
				return new Promise(function(resolve, reject) {
					resolvePage($notebook, requestPath, function(err, pfr) {
						if (err) {
							if (err.type === 'redirect') {
								return resolve(r.redirect(err.path));
							} else if (err.type === 'notfound') {
								return reject(404);
							} else {
								return reject(500);
							}
						}
						console.log(pfr);
						if (pfr.translationRequired()) {
							var t = translator(pfr.sourceType, pfr.requestedType);
							if (t) {
				                resolve(t(pfr, req, r, res));
				            } else {
				            	resolve(r.text(406, 'No conversion available from ' + pfr.sourceType + ' -> ' + pfr.requestedType));
				            }
						} else {
							resolve(r.file(pfr.sourcePath(), types[pfr.sourceType].mimeType));
						}
					});
				});
			}
		}
	]
}).listen(8080);

function Notebook(root) {
    this.root = root;
}

var $notebook = new Notebook(notebookRoot);

function findChildren(parent) {
	
	function _getChildren(page, cb) {
		var pagePath = $notebook.root + page;
		fs.readdir(pagePath, function(err, files) {
			if (err) return cb(err);

			files = files.map(function(f) {
				return {
					path: page + f + '/',
					basename: f
				};
			}).filter(function(f) {
				return !f.path.match(/\/_/);
			});

			async.map(files, function(f, cb) {
				fs.stat($notebook.root + f.path, function(err, stat) {
					if (err) return cb(null, null);
					f.stat = stat;
					return cb(null, f);
				});
			}, function(err, files) {
				files = files.filter(function(f) {
					return f && f.stat.isDirectory();
				});
				async.map(files, function(f, cb) {
					_getTitle(f.path, null, function(title) {
						f.title = title;
						return cb(null, f);
					});
				}, function(err, files) {
					cb(null, files.map(function(f) {
						return {
							title: f.title,
							path: f.path
						}
					}));
				});
			});
		});
	}

	function _getTitle(page, defaultTitle, cb) {
		var metaPath = $notebook.root + page + 'meta.info';
		fs.readFile(metaPath, 'utf8', function(err, meta) {
			if (!err && meta.match(/^title:\s+([^\r\n$]+)/)) {
				cb(RegExp.$1);
			} else if (!defaultTitle) {
				var chunks = page.replace(/\/+$/g, '').split('/');
				cb(chunks.pop());
			} else {
				cb(defaultTitle);
			}
		});
	}

	return new Promise(function(resolve, reject) {
		if (parent.length === 0) {
			_getTitle('/', 'Notebook', function(title) {
				resolve([{title: title, path: '/'}]);
			});
		} else {
			_getChildren(parent, function(err, children) {
				resolve(children);
			});
		}
	});
}

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