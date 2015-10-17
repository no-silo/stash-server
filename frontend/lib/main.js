var ev = require('dom-bind');

window.init = function() {
	var sidebar = document.querySelector('.sidebar');

	fetch('/children?', {
		method: 'get'
	}).then(function(response) {
		response.json().then(function(children) {
			sidebar.appendChild(_createChildList(children));
		});
	});

	var busy = false;
	ev.delegate(sidebar, 'click', 'a', function(evt) {
		evt.preventDefault();
		if (busy) return;
		busy = true;
		var li = evt.delegateTarget.parentNode;
		if (li.childNodes.length > 1) return;
		fetch('/children?' + evt.delegateTarget.getAttribute('data-page'), {
			method: 'get'
		}).then(function(response) {
			busy = false;
			response.json().then(function(children) {
				li.appendChild(_createChildList(children));
			});
		}, function() {
			busy = false;
		});
	});

	function _createChildList(children) {
		var ul = document.createElement('ul');
		children.forEach(function(child) {
			var li = document.createElement('li');
			var a = document.createElement('a');
			a.textContent = child.title;
			a.href = '#';
			a.setAttribute('data-page', child.path);
			li.appendChild(a);
			ul.appendChild(li);
		});
		return ul;
	}

}