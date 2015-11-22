var fs = require('fs');

function _makeImageConverter(targetFormat) {
    return function(req, params, r, res) {
    	return r.html('<h3>converting image to: ' + targetFormat + '</h3>');
    }
}

module.exports = {
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